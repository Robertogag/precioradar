import { afterEach, describe, expect, it } from 'vitest';
import type { StoreAdapter } from '../src/application/ports.ts';
import { createLinksService } from '../src/application/links.ts';
import { createSearchService } from '../src/application/searchOffers.ts';
import { createSuggestService } from '../src/application/suggest.ts';
import { KNOWN_MODELS } from '../src/domain/models.ts';
import type { RawOffer } from '../src/domain/offer.ts';
import { createMemoryCache } from '../src/infrastructure/cache/memoryCache.ts';
import { createMemoryHistory } from '../src/infrastructure/persistence/memoryHistory.ts';
import { type SecurityOptions, buildServer, isAllowedOrigin } from '../src/interfaces/http/server.ts';

const offer = (id: string, title: string, price: number): RawOffer => ({ externalId: id, title, price, url: `https://x/${id}`, brand: 'Apple' });

const store: StoreAdapter = {
  info: { id: 'a', name: 'A', country: 'MX', homepage: 'https://x', access: 'catalogo-publico', availability: 'activa', note: null },
  currency: 'MXN',
  search: async () => [offer('1', 'Apple iPhone 15 128GB', 15000)],
};

const SECURITY: SecurityOptions = {
  allowedOrigins: ['https://comparador.ejemplo.com'],
  trustProxy: false,
  rateLimitPerMinute: 100,
  searchesPerMinute: 2,
  webDist: null,
};

async function build(security: Partial<SecurityOptions> = {}) {
  const clock = { now: () => Date.now() };
  const cache = createMemoryCache(clock);
  const history = createMemoryHistory();
  const links = createLinksService({
    linkers: [
      {
        storeId: 'ml',
        storeName: 'ML',
        country: 'MX',
        searchUrl: (t) => `https://ml/buscar/${encodeURIComponent(t)}`,
        productUrl: async (title) => (title.includes('iPhone') ? 'https://ml/p/1' : null),
      },
    ],
    cache,
    timeoutMs: 100,
    concurrency: 2,
    hitTtlMs: 60_000,
    missTtlMs: 60_000,
  });
  const service = createSearchService({
    stores: [store],
    cache,
    clock,
    storeTimeoutMs: 100,
    perStoreLimit: 10,
    searchTtlMs: 60_000,
    dealsTtlMs: 60_000,
    history,
    links,
  });
  const suggester = createSuggestService({ models: KNOWN_MODELS, history, cache, learnedTtlMs: 0 });
  const app = await buildServer({
    service,
    suggester,
    links,
    catalog: [store.info],
    version: 'test',
    security: { ...SECURITY, ...security },
    logger: false,
  });
  return { app, history };
}

let open: { close(): Promise<unknown> } | null = null;
afterEach(async () => {
  await open?.close();
  open = null;
});

describe('cabeceras de seguridad', () => {
  it('toda respuesta trae CSP, nosniff y prohíbe enmarcar la página', async () => {
    const { app } = await build();
    open = app;
    const res = await app.inject('/health');
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('las mismas rutas contestan en la raíz (app de celular) y bajo /api (web)', async () => {
    const { app } = await build();
    open = app;
    const a = await app.inject('/countries');
    const b = await app.inject('/api/countries');
    expect(a.statusCode).toBe(200);
    expect(b.json()).toEqual(a.json());
  });

  it('una ruta que no existe contesta JSON 404, nunca una traza', async () => {
    const { app } = await build();
    open = app;
    const res = await app.inject('/api/lo-que-sea');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'no-encontrado', message: 'No existe esa ruta.' });
  });
});

describe('CORS: solo los orígenes permitidos', () => {
  it('el dominio de la lista recibe permiso; otro dominio no', async () => {
    const { app } = await build();
    open = app;
    const ok = await app.inject({ url: '/api/countries', headers: { origin: 'https://comparador.ejemplo.com' } });
    expect(ok.headers['access-control-allow-origin']).toBe('https://comparador.ejemplo.com');
    const bad = await app.inject({ url: '/api/countries', headers: { origin: 'https://otro.com' } });
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('en desarrollo (sin lista) solo pasan localhost y la red local', () => {
    expect(isAllowedOrigin('http://localhost:5173', null)).toBe(true);
    expect(isAllowedOrigin('http://192.168.1.20:8081', null)).toBe(true);
    expect(isAllowedOrigin('http://10.4.0.9', null)).toBe(true);
    expect(isAllowedOrigin('https://evil.example', null)).toBe(false);
    expect(isAllowedOrigin('no-es-url', null)).toBe(false);
    expect(isAllowedOrigin(undefined, null)).toBe(true);
    expect(isAllowedOrigin(undefined, ['https://a.com'])).toBe(true);
  });
});

describe('validación de entrada', () => {
  it('rechaza búsquedas demasiado largas o países raros con un mensaje claro', async () => {
    const { app } = await build();
    open = app;
    const long = await app.inject(`/api/search?q=${'a'.repeat(121)}`);
    expect(long.statusCode).toBe(400);
    expect(long.json().error).toBe('peticion-invalida');
    const country = await app.inject('/api/stores?country=MEXICO');
    expect(country.statusCode).toBe(400);
    const limit = await app.inject('/api/suggest?q=iph&limit=999');
    expect(limit.statusCode).toBe(400);
  });

  it('la búsqueda tiene su propio límite por minuto y al pasarlo contesta 429 en JSON', async () => {
    const { app } = await build();
    open = app;
    const r1 = await app.inject('/api/search?q=iphone+15');
    const r2 = await app.inject('/api/search?q=iphone+15');
    const r3 = await app.inject('/api/search?q=iphone+15');
    expect([r1.statusCode, r2.statusCode]).toEqual([200, 200]);
    expect(r3.statusCode).toBe(429);
    expect(r3.json()).toEqual({ error: 'demasiadas-peticiones', message: 'Demasiadas peticiones seguidas. Espera un minuto.' });
    // Las demás rutas siguen contestando: el límite de la búsqueda no las toca.
    expect((await app.inject('/api/health')).statusCode).toBe(200);
  });
});

describe('/suggest', () => {
  it('sugiere modelos del catálogo y, cuando el modelo está completo, variantes y hermanos para comparar', async () => {
    const { app } = await build();
    open = app;
    const res = await app.inject('/api/suggest?q=iphone+15');
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=60');
    const body = res.json();
    expect(body.suggestions[0]).toMatchObject({ text: 'Apple iPhone 15 128GB', kind: 'variante' });
    expect(body.related.map((r: { text: string }) => r.text)).toContain('Apple iPhone 15 Pro');
  });

  it('aprende de las búsquedas que sí trajeron resultados y las sugiere como populares', async () => {
    const { app, history } = await build();
    open = app;
    const search = await app.inject('/api/search?q=iphone+15+negro');
    expect(search.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 10));
    expect(history.searches).toHaveLength(1);
    expect(history.searches[0]).toMatchObject({ query: 'iphone 15 negro', country: 'MX', resultCount: 1, storeCount: 1 });
    expect(history.prices[0]).toMatchObject({ storeId: 'a', externalId: '1', price: 15000 });
    const res = await app.inject('/api/suggest?q=iphone+15+ne');
    expect(res.json().suggestions).toContainEqual({ text: 'iphone 15 negro', kind: 'popular', brand: null, category: null });
  });
});

describe('enlaces a tiendas que no se consultan', () => {
  it('cada producto de la búsqueda trae el buscador de esas tiendas, y /links lo mejora a la página del producto', async () => {
    const { app } = await build();
    open = app;
    const search = await app.inject('/api/search?q=iphone+15');
    expect(search.statusCode).toBe(200);
    const group = search.json().groups[0];
    expect(group.links).toEqual([{ storeId: 'ml', storeName: 'ML', url: 'https://ml/buscar/Apple%20iPhone%2015%20128GB', kind: 'busqueda' }]);

    const found = await app.inject(`/api/links?title=${encodeURIComponent(group.title)}&brand=Apple`);
    expect(found.statusCode).toBe(200);
    expect(found.headers['cache-control']).toBe('private, max-age=3600');
    expect(found.json()).toEqual({ country: 'MX', title: group.title, links: [{ storeId: 'ml', storeName: 'ML', url: 'https://ml/p/1', kind: 'producto' }] });

    const unknown = await app.inject('/api/links?title=Licuadora+Oster');
    expect(unknown.json().links[0]).toMatchObject({ kind: 'busqueda' });

    const short = await app.inject('/api/links?title=a');
    expect(short.statusCode).toBe(400);
  });
});
