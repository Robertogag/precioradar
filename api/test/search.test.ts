import { describe, expect, it } from 'vitest';
import { type StoreAdapter, StoreBlockedError, StoreCredentialsError } from '../src/application/ports.ts';
import { EmptyQueryError, createSearchService } from '../src/application/searchOffers.ts';
import type { RawOffer } from '../src/domain/offer.ts';
import { createMemoryCache } from '../src/infrastructure/cache/memoryCache.ts';
import { buildServer } from '../src/interfaces/http/server.ts';

function fakeStore(id: string, behavior: () => Promise<RawOffer[]>, withDeals = false): StoreAdapter & { calls: number } {
  const store = {
    calls: 0,
    info: { id, name: id.toUpperCase(), country: 'MX', homepage: 'https://x', access: 'catalogo-publico' as const, availability: 'activa' as const, note: null },
    currency: 'MXN',
    search: async () => {
      store.calls++;
      return behavior();
    },
    ...(withDeals ? { deals: behavior } : {}),
  };
  return store;
}

const offer = (id: string, title: string, price: number, listPrice?: number): RawOffer => ({ externalId: id, title, price, listPrice, url: `https://x/${id}`, brand: 'Apple' });

function build(stores: StoreAdapter[]) {
  let now = 1_000_000;
  const clock = { now: () => now };
  const service = createSearchService({
    stores,
    cache: createMemoryCache(clock),
    clock,
    storeTimeoutMs: 50,
    perStoreLimit: 40,
    searchTtlMs: 600_000,
    dealsTtlMs: 600_000,
  });
  return { service, advance: (ms: number) => (now += ms) };
}

const input = { query: 'iphone 15', country: 'MX', state: null, sort: 'relevancia' as const, includeAccessories: false, includeRefurbished: false };

describe('búsqueda en todas las tiendas', () => {
  it('compara el mismo producto entre tiendas y dice en cuál sale más barato', async () => {
    const { service } = build([
      fakeStore('a', async () => [offer('1', 'Apple iPhone 15 128GB Negro', 15000, 18000)]),
      fakeStore('b', async () => [offer('2', 'Apple iPhone 15 128GB Azul', 14200)]),
    ]);
    const res = await service.search(input);
    expect(res.groups).toHaveLength(1);
    expect(res.groups[0]!.best.storeId).toBe('b');
    expect(res.groups[0]!.offers.map((o) => o.price)).toEqual([14200, 15000]);
    expect(res.groups[0]!.spread).toBe(800);
  });

  it('una tienda caída, bloqueada, lenta o sin llaves no tumba la búsqueda y queda reportada con su razón', async () => {
    const { service } = build([
      fakeStore('ok', async () => [offer('1', 'Apple iPhone 15 128GB', 15000)]),
      fakeStore('muro', async () => { throw new StoreBlockedError('captcha'); }),
      fakeStore('llaves', async () => { throw new StoreCredentialsError('faltan llaves'); }),
      fakeStore('caida', async () => { throw new Error('HTTP 500'); }),
      fakeStore('lenta', () => new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('t'), { name: 'TimeoutError' })), 10))),
      fakeStore('vacia', async () => [offer('9', 'Scott Toalla Multiusos', 429)]),
    ]);
    const res = await service.search(input);
    expect(res.totalOffers).toBe(1);
    expect(Object.fromEntries(res.stores.map((s) => [s.storeId, s.status]))).toEqual({
      ok: 'ok',
      muro: 'bloqueada',
      llaves: 'requiere-credenciales',
      caida: 'error',
      lenta: 'tiempo-agotado',
      vacia: 'sin-resultados',
    });
  });

  it('oculta accesorios y reacondicionados, dice cuántos ocultó y los enseña si se piden', async () => {
    const { service } = build([
      fakeStore('a', async () => [
        offer('1', 'Apple iPhone 15 128GB', 15000),
        offer('2', 'Funda para iPhone 15', 199),
        offer('3', 'Apple iPhone 15 128GB Reacondicionado', 9000),
      ]),
    ]);
    const hidden = await service.search(input);
    expect(hidden.totalOffers).toBe(1);
    expect(hidden.hiddenAccessories).toBe(1);
    expect(hidden.hiddenRefurbished).toBe(1);
    const all = await service.search({ ...input, includeAccessories: true, includeRefurbished: true });
    expect(all.totalOffers).toBe(3);
  });

  it('cambiar orden o filtros no vuelve a consultar a las tiendas; al vencer la caché sí', async () => {
    const store = fakeStore('a', async () => [offer('1', 'Apple iPhone 15 128GB', 15000)]);
    const { service, advance } = build([store]);
    await service.search(input);
    const second = await service.search({ ...input, sort: 'precio', query: '  IPHONE   15 ' });
    expect(store.calls).toBe(1);
    expect(second.cached).toBe(true);
    advance(600_001);
    await service.search(input);
    expect(store.calls).toBe(2);
  });

  it('si ninguna tienda contestó no guarda el fracaso en caché', async () => {
    let fail = true;
    const store = fakeStore('a', async () => {
      if (fail) throw new Error('sin internet');
      return [offer('1', 'Apple iPhone 15 128GB', 15000)];
    });
    const { service } = build([store]);
    expect((await service.search(input)).totalOffers).toBe(0);
    fail = false;
    expect((await service.search(input)).totalOffers).toBe(1);
  });

  it('si la búsqueda trae una marca, la marca es obligatoria; la palabra genérica no', async () => {
    const tv = (id: string, title: string, brand: string): RawOffer => ({ externalId: id, title, price: 9000, url: `https://x/${id}`, brand });
    const { service } = build([
      fakeStore('a', async () => [
        tv('1', 'Pantalla Samsung 55 pulgadas Crystal UHD', 'Samsung'),
        tv('2', 'Smart TV 55 pulgadas Crystal UHD', 'Samsung'), // sin "pantalla" y con la marca solo en su campo
        tv('3', 'Pantalla TCL 55 pulgadas QLED', 'TCL'),
      ]),
    ]);
    const res = await service.search({ ...input, query: 'pantalla samsung 55' });
    expect(res.groups.flatMap((g) => g.offers.map((o) => o.id)).sort()).toEqual(['a:1', 'a:2']);
  });

  it('rechaza una búsqueda vacía', async () => {
    const { service } = build([]);
    await expect(service.search({ ...input, query: ' de la ' })).rejects.toBeInstanceOf(EmptyQueryError);
  });

  it('descuentos: ordena por porcentaje y descarta rebajas inverosímiles', async () => {
    const { service } = build([
      fakeStore('a', async () => [offer('1', 'Licuadora', 500, 1000), offer('2', 'Tostador', 900, 1000), offer('3', 'Sin rebaja', 100), offer('4', 'Precio inflado', 10, 5000)], true),
    ]);
    const res = await service.deals('MX');
    expect(res.offers.map((o) => o.discountPct)).toEqual([50, 10]);
  });
});

describe('API HTTP', () => {
  it('valida la petición y responde el contrato', async () => {
    const { service } = build([fakeStore('a', async () => [offer('1', 'Apple iPhone 15 128GB', 15000)])]);
    const suggester = { forQuery: async () => ({ query: '', suggestions: [], related: [] }) };
    const security = { allowedOrigins: null, trustProxy: false, rateLimitPerMinute: 100, searchesPerMinute: 100, webDist: null };
    const app = await buildServer({ service, suggester, catalog: [], version: 'test', security, logger: false });
    const ok = await app.inject({ url: '/search?q=iphone%2015&country=mx&sort=precio' });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ query: 'iphone 15', country: 'MX', sort: 'precio', totalOffers: 1 });
    expect((await app.inject({ url: '/search?q=a' })).statusCode).toBe(400);
    expect((await app.inject({ url: '/search?q=iphone&country=AR' })).json()).toMatchObject({ error: 'pais-desconocido' });
    await app.close();
  });
});
