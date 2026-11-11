import { describe, expect, it } from 'vitest';
import type { StatsResponse } from '../../shared/contracts.ts';
import { type StoreAdapter, StoreCredentialsError } from '../src/application/ports.ts';
import { createSearchService } from '../src/application/searchOffers.ts';
import { createStatsService } from '../src/application/stats.ts';
import type { RawOffer } from '../src/domain/offer.ts';
import { createMemoryCache } from '../src/infrastructure/cache/memoryCache.ts';
import { createMemoryHistory } from '../src/infrastructure/persistence/memoryHistory.ts';
import { buildServer } from '../src/interfaces/http/server.ts';

const offer = (id: string, title: string, price: number): RawOffer => ({ externalId: id, title, price, url: `https://x/${id}`, brand: 'Apple' });

function store(id: string, behavior: () => Promise<RawOffer[]>): StoreAdapter {
  return {
    info: { id, name: id.toUpperCase(), country: 'MX', homepage: 'https://x', access: 'catalogo-publico', availability: 'activa', note: null },
    currency: 'MXN',
    search: behavior,
  };
}

// 11-nov-2026 12:00 en Ciudad de México (UTC-6, sin horario de verano).
const NOON_NOV_11 = Date.parse('2026-11-11T18:00:00Z');
const DAY = 86_400_000;

function setup() {
  let now = NOON_NOV_11;
  const clock = { now: () => now };
  const history = createMemoryHistory(clock.now);
  const service = createSearchService({
    stores: [
      store('ok', async () => [offer('1', 'Apple iPhone 15 128GB', 15000)]),
      store('vacia', async () => []),
      // Sin llaves: falla sin segundo intento (un error común reintenta a los 1.2 s y alarga las pruebas).
      store('caida', async () => {
        throw new StoreCredentialsError('faltan llaves');
      }),
    ],
    cache: createMemoryCache(clock),
    clock,
    storeTimeoutMs: 1_000,
    perStoreLimit: 40,
    searchTtlMs: 600_000,
    dealsTtlMs: 600_000,
    history,
  });
  const stats = createStatsService({ history, clock, storeName: (id) => id.toUpperCase() });
  return { service, history, stats, clock, advance: (ms: number) => (now += ms) };
}

const input = { query: 'iphone 15', country: 'MX', state: null, sort: 'relevancia' as const, includeAccessories: false, includeRefurbished: false };
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('qué se anota de cada búsqueda', () => {
  it('cada búsqueda de una persona queda anotada, también la repetida que sale de caché, con su código de visitante', async () => {
    const { service, history } = setup();
    await service.search({ ...input, visitor: 'v1' });
    await service.search({ ...input, visitor: 'v2' });
    await settle();
    expect(history.searches.map((s) => [s.origin, s.fromCache, s.visitor])).toEqual([
      ['persona', false, 'v1'],
      ['persona', true, 'v2'],
    ]);
  });

  it('las búsquedas del refresco automático se anotan como refresco y no cuentan para lo más buscado ni las sugerencias', async () => {
    const { service, history } = setup();
    await service.search({ ...input, fresh: true, origin: 'refresco' });
    await settle();
    expect(history.searches.map((s) => s.origin)).toEqual(['refresco']);
    expect(await history.topTerms('MX', 10)).toEqual([]);
    expect(await history.learnedTerms('MX', 'iph', 10)).toEqual([]);
  });
});

describe('estadísticas', () => {
  it('cuenta por día búsquedas de personas, repetidas, visitantes distintos y refrescos, con los días vacíos en cero', async () => {
    const { service, stats, advance } = setup();
    advance(-DAY); // 10-nov
    await service.search({ ...input, visitor: 'a' });
    advance(DAY); // 11-nov
    await service.search({ ...input, query: 'licuadora oster', visitor: 'a' });
    await service.search({ ...input, query: 'licuadora oster', visitor: 'b' }); // de caché
    await service.search({ ...input, query: 'licuadora oster', visitor: 'b' }); // de caché, mismo visitante
    await service.search({ ...input, query: 'pantalla 55', fresh: true, origin: 'refresco' });
    await settle();
    const r: StatsResponse = await stats.report('MX', 3);
    expect(r.from).toBe('2026-11-09');
    expect(r.to).toBe('2026-11-11');
    expect(r.daily).toEqual([
      { day: '2026-11-09', searches: 0, fromCache: 0, visitors: 0, refresh: 0 },
      { day: '2026-11-10', searches: 1, fromCache: 0, visitors: 1, refresh: 0 },
      { day: '2026-11-11', searches: 3, fromCache: 2, visitors: 2, refresh: 1 },
    ]);
    expect(r.totals).toEqual({ searches: 4, fromCache: 2, visits: 3, refresh: 1 });
    expect(r.topQueries.map((q) => [q.query, q.searches])).toEqual([
      ['licuadora oster', 3],
      ['iphone 15', 1],
    ]);
  });

  it('dice qué busca la gente que no encontró nada y qué tan seguido contesta o falla cada tienda', async () => {
    const { service, stats } = setup();
    await service.search({ ...input, query: 'producto inexistente xyz', visitor: 'a' });
    await service.search({ ...input, visitor: 'a' });
    await settle();
    const r = await stats.report('MX', 7);
    expect(r.noResults.map((q) => q.query)).toEqual(['producto inexistente xyz']);
    const byId = Object.fromEntries(r.stores.map((s) => [s.storeId, s]));
    expect(byId.ok).toMatchObject({ storeName: 'OK', runs: 2, ok: 1, empty: 1, failed: 0 });
    expect(byId.caida).toMatchObject({ runs: 2, ok: 0, failed: 2 });
  });
});

describe('ruta privada de estadísticas', () => {
  it('sin la llave correcta responde 404 como si no existiera; con ella, el reporte', async () => {
    const { service, stats } = setup();
    const suggester = { forQuery: async () => ({ query: '', suggestions: [], related: [] }) };
    const security = { allowedOrigins: null, trustProxy: false, rateLimitPerMinute: 100, searchesPerMinute: 100, webDist: null };
    const app = await buildServer({ service, suggester, catalog: [], version: 'test', security, logger: false, stats, statsKey: 'llave-de-prueba-123' });
    expect((await app.inject('/api/stats')).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/stats', headers: { 'x-stats-key': 'otra' } })).statusCode).toBe(404);
    const ok = await app.inject({ url: '/api/stats?days=7', headers: { 'x-stats-key': 'llave-de-prueba-123' } });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    expect((ok.json() as StatsResponse).daily).toHaveLength(7);
    await app.close();
  });

  it('cada búsqueda por la web lleva un código de visitante que no es la IP y cambia de un día a otro', async () => {
    const { service, history, advance } = setup();
    const suggester = { forQuery: async () => ({ query: '', suggestions: [], related: [] }) };
    const security = { allowedOrigins: null, trustProxy: false, rateLimitPerMinute: 100, searchesPerMinute: 100, webDist: null };
    let now = NOON_NOV_11;
    const app = await buildServer({ service, suggester, catalog: [], version: 'test', security, logger: false, visitorKey: 'secreto', now: () => now });
    await app.inject({ url: '/api/search?q=iphone%2015', remoteAddress: '201.10.20.30' });
    await app.inject({ url: '/api/search?q=iphone%2015', remoteAddress: '201.10.20.30' });
    now += DAY;
    advance(DAY);
    await app.inject({ url: '/api/search?q=iphone%2015', remoteAddress: '201.10.20.30' });
    await settle();
    const codes = history.searches.map((s) => s.visitor);
    expect(codes[0]).toBe(codes[1]);
    expect(codes[2]).not.toBe(codes[0]);
    expect(codes.every((c) => typeof c === 'string' && !c.includes('201.10'))).toBe(true);
    await app.close();
  });
});
