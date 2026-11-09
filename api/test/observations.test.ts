import { describe, expect, it } from 'vitest';
import { createObservationsService } from '../src/application/observations.ts';
import { type StoreAdapter, StoreBlockedError } from '../src/application/ports.ts';
import { createSearchService } from '../src/application/searchOffers.ts';
import { createSuggestService } from '../src/application/suggest.ts';
import { assistedLink } from '../src/domain/assisted.ts';
import { KNOWN_MODELS } from '../src/domain/models.ts';
import { createMemoryCache } from '../src/infrastructure/cache/memoryCache.ts';
import { createMemoryHistory } from '../src/infrastructure/persistence/memoryHistory.ts';
import { buildServer } from '../src/interfaces/http/server.ts';

describe('precios vistos por personas (Mercado Libre desde la app)', () => {
  it('reconoce ligas de Mercado Libre y saca el id del producto; rechaza otras', () => {
    expect(assistedLink('https://www.mercadolibre.com.mx/p/MLM48921521?pdp_filters=x#reviews')).toMatchObject({ externalId: 'MLM48921521', cleanUrl: 'https://www.mercadolibre.com.mx/p/MLM48921521' });
    expect(assistedLink('https://articulo.mercadolibre.com.mx/MLM-2057118734-consola-nintendo-switch-2-_JM')).toMatchObject({ externalId: 'MLM2057118734' });
    expect(assistedLink('https://listado.mercadolibre.com.mx/nintendo-switch-2')).toBeNull();
    expect(assistedLink('https://www.amazon.com.mx/dp/B0DPLXY')).toBeNull();
    expect(assistedLink('http://www.mercadolibre.com.mx/p/MLM1')).toBeNull();
    expect(assistedLink('no es liga')).toBeNull();
  });

  it('guarda lo válido con origen "usuario", rechaza lo que no y no repite el mismo producto en un envío', async () => {
    const history = createMemoryHistory();
    const service = createObservationsService({ history });
    const result = await service.record('MX', [
      { url: 'https://www.mercadolibre.com.mx/p/MLM48921521', title: 'Consola Nintendo Switch 2', price: 9999, listPrice: 13999 },
      { url: 'https://www.mercadolibre.com.mx/p/MLM48921521?x=1', title: 'Consola Nintendo Switch 2', price: 9999 },
      { url: 'https://www.amazon.com.mx/dp/B0DPLXY', title: 'Otra cosa', price: 100 },
      { url: 'https://www.mercadolibre.com.mx/p/MLM100001', title: 'Barato imposible', price: 0.5 },
      { url: 'https://www.mercadolibre.com.mx/p/MLM100002', title: 'ab', price: 100 },
    ]);
    expect(result.accepted).toBe(1);
    expect(result.rejected.map((r) => r.reason)).toEqual(['liga-desconocida', 'precio-increible', 'sin-titulo']);
    expect(history.prices).toHaveLength(1);
    expect(history.prices[0]).toMatchObject({ storeId: 'mercadolibre', externalId: 'MLM48921521', price: 9999, listPrice: 13999, source: 'usuario', url: 'https://www.mercadolibre.com.mx/p/MLM48921521' });
  });

  it('la búsqueda enseña ese precio como respaldo de Mercado Libre, con fecha y "visto por un usuario"', async () => {
    let now = Date.parse('2026-11-08T20:00:00Z');
    const clock = { now: () => now };
    const history = createMemoryHistory(() => now);
    await createObservationsService({ history }).record('MX', [{ url: 'https://www.mercadolibre.com.mx/p/MLM48921521', title: 'Consola Nintendo Switch 2', price: 9999 }]);
    now += 3 * 60 * 60_000;
    const meli: StoreAdapter = {
      info: { id: 'mercadolibre', name: 'Mercado Libre', country: 'MX', homepage: 'https://x', access: 'api-oficial', availability: 'bloqueada', note: null },
      currency: 'MXN',
      search: async () => {
        throw new StoreBlockedError('403');
      },
    };
    const search = createSearchService({ stores: [meli], cache: createMemoryCache(clock), clock, storeTimeoutMs: 50, perStoreLimit: 10, searchTtlMs: 1, dealsTtlMs: 1, history, storeMemory: createMemoryCache(clock) });
    const res = await search.search({ query: 'nintendo switch 2', country: 'MX', state: null, sort: 'relevancia', includeAccessories: false, includeRefurbished: false });
    expect(res.stores[0]).toMatchObject({ storeId: 'mercadolibre', status: 'ok', count: 1, ageMinutes: 180 });
    expect(res.groups[0]!.best).toMatchObject({ storeId: 'mercadolibre', price: 9999, seenBy: 'usuario' });
    expect(res.groups[0]!.best.seenAt).toBe('2026-11-08T20:00:00.000Z');
  });

  it('la ruta POST /api/observations valida el cuerpo y contesta 202', async () => {
    const clock = { now: () => Date.now() };
    const cache = createMemoryCache(clock);
    const history = createMemoryHistory();
    const app = await buildServer({
      service: createSearchService({ stores: [], cache, clock, storeTimeoutMs: 50, perStoreLimit: 10, searchTtlMs: 1, dealsTtlMs: 1 }),
      suggester: createSuggestService({ models: KNOWN_MODELS, history, cache, learnedTtlMs: 0 }),
      observations: createObservationsService({ history }),
      catalog: [],
      version: 'test',
      security: { allowedOrigins: null, trustProxy: false, rateLimitPerMinute: 100, searchesPerMinute: 10, webDist: null },
      logger: false,
    });
    try {
      const ok = await app.inject({ method: 'POST', url: '/api/observations', payload: { country: 'MX', items: [{ url: 'https://www.mercadolibre.com.mx/p/MLM48921521', title: 'Consola Nintendo Switch 2', price: 9999 }] } });
      expect(ok.statusCode).toBe(202);
      expect(ok.json()).toEqual({ accepted: 1, rejected: [] });
      const bad = await app.inject({ method: 'POST', url: '/api/observations', payload: { country: 'MX', items: [] } });
      expect(bad.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });
});
