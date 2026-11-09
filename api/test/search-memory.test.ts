import { describe, expect, it } from 'vitest';
import { type StoreAdapter, StoreBlockedError } from '../src/application/ports.ts';
import { createSearchService } from '../src/application/searchOffers.ts';
import type { RawOffer } from '../src/domain/offer.ts';
import { createMemoryCache } from '../src/infrastructure/cache/memoryCache.ts';
import { createMemoryHistory } from '../src/infrastructure/persistence/memoryHistory.ts';
import { parseAmazonSearch } from '../src/infrastructure/stores/amazon.ts';

const offer = (id: string, title: string, price: number): RawOffer => ({ externalId: id, title, price, url: `https://x/${id}`, brand: 'Apple' });

describe('memoria por tienda: si hoy no contesta, vale su última respuesta buena', () => {
  it('Amazon contesta, luego pide captcha: la búsqueda sigue enseñando sus precios y dice de hace cuánto son', async () => {
    let now = 1_000_000;
    const clock = { now: () => now };
    let blocked = false;
    const amazon: StoreAdapter = {
      info: { id: 'amazon', name: 'Amazon', country: 'MX', homepage: 'https://x', access: 'pagina-web', availability: 'activa', note: null },
      currency: 'MXN',
      search: async () => {
        if (blocked) throw new StoreBlockedError('captcha');
        return [offer('1', 'Apple iPhone 15 128GB', 15000)];
      },
    };
    const service = createSearchService({
      stores: [amazon],
      cache: createMemoryCache(clock),
      clock,
      storeTimeoutMs: 50,
      perStoreLimit: 10,
      searchTtlMs: 1, // la caché de la búsqueda vence enseguida para que se vuelva a consultar la tienda
      dealsTtlMs: 1,
      storeMemory: createMemoryCache(clock),
    });
    const input = { query: 'iphone 15', country: 'MX', state: null, sort: 'relevancia' as const, includeAccessories: false, includeRefurbished: false };

    const first = await service.search(input);
    expect(first.stores[0]).toMatchObject({ status: 'ok', count: 1, ageMinutes: null });

    blocked = true;
    now += 35 * 60_000;
    const second = await service.search(input);
    expect(second.stores[0]).toMatchObject({ status: 'ok', count: 1, ageMinutes: 35 });
    expect(second.totalOffers).toBe(1);

    // Pasadas 12 horas la memoria caduca: ya no se enseñan precios viejos como si fueran de hoy.
    now += 13 * 60 * 60_000;
    const third = await service.search(input);
    expect(third.stores[0]).toMatchObject({ status: 'bloqueada', count: 0 });
  });

  it('sin memoria previa, una tienda bloqueada sigue reportándose bloqueada', async () => {
    const clock = { now: () => 1 };
    const muro: StoreAdapter = {
      info: { id: 'muro', name: 'Muro', country: 'MX', homepage: 'https://x', access: 'pagina-web', availability: 'activa', note: null },
      currency: 'MXN',
      search: async () => {
        throw new StoreBlockedError('captcha');
      },
    };
    const service = createSearchService({ stores: [muro], cache: createMemoryCache(clock), clock, storeTimeoutMs: 50, perStoreLimit: 10, searchTtlMs: 1, dealsTtlMs: 1, storeMemory: createMemoryCache(clock) });
    const res = await service.search({ query: 'iphone 15', country: 'MX', state: null, sort: 'relevancia', includeAccessories: false, includeRefurbished: false });
    expect(res.stores[0]).toMatchObject({ status: 'bloqueada', ageMinutes: null });
  });

  it('sin memoria reciente, se enseñan los precios guardados en el historial de los últimos días, con su fecha', async () => {
    let now = Date.parse('2026-11-08T12:00:00Z');
    const clock = { now: () => now };
    const history = createMemoryHistory(() => now);
    await history.recordPrices([
      { country: 'MX', storeId: 'amazon', externalId: 'B1', title: 'Apple iPhone 15 128GB Negro', brand: 'Apple', price: 14999, listPrice: null, currency: 'MXN', url: 'https://x/B1' },
      { country: 'MX', storeId: 'amazon', externalId: 'B2', title: 'Funda para iPhone 15', brand: null, price: 199, listPrice: null, currency: 'MXN', url: 'https://x/B2' },
      { country: 'MX', storeId: 'amazon', externalId: 'B3', title: 'Samsung Galaxy S24 128GB', brand: 'Samsung', price: 12999, listPrice: null, currency: 'MXN', url: 'https://x/B3' },
    ]);
    now += 2 * 24 * 60 * 60_000; // dos días después Amazon pide captcha
    const amazon: StoreAdapter = {
      info: { id: 'amazon', name: 'Amazon', country: 'MX', homepage: 'https://x', access: 'pagina-web', availability: 'activa', note: null },
      currency: 'MXN',
      search: async () => {
        throw new StoreBlockedError('captcha');
      },
    };
    const service = createSearchService({ stores: [amazon], cache: createMemoryCache(clock), clock, storeTimeoutMs: 50, perStoreLimit: 10, searchTtlMs: 1, dealsTtlMs: 1, history, storeMemory: createMemoryCache(clock) });
    const res = await service.search({ query: 'iphone 15', country: 'MX', state: null, sort: 'relevancia', includeAccessories: false, includeRefurbished: false });
    // Dos coincidencias guardadas (el iPhone y su funda); el Galaxy no trae las palabras buscadas.
    expect(res.stores[0]).toMatchObject({ status: 'ok', count: 2, ageMinutes: 2 * 24 * 60 });
    const offer = res.groups[0]!.best;
    expect(offer.title).toBe('Apple iPhone 15 128GB Negro');
    expect(offer.seenAt).toBe('2026-11-08T12:00:00.000Z');
    // El Galaxy no trae las palabras buscadas; la funda es accesorio y queda oculta por omisión.
    expect(res.hiddenAccessories).toBe(1);
  });

  it('Amazon: una página sin resultados ni buscador es un bloqueo suave, no "no hay"', () => {
    expect(() => parseAmazonSearch('<html><body><div id="a-page">Lo sentimos</div></body></html>')).toThrow(StoreBlockedError);
    expect(parseAmazonSearch('<html><body><div class="s-main-slot"></div><div>No se encontraron resultados para xyz</div></body></html>')).toEqual([]);
  });
});
