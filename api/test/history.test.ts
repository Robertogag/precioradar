import { describe, expect, it } from 'vitest';
import { HistoryRangeError, createHistoryService } from '../src/application/history.ts';
import type { PriceRecord } from '../src/application/ports.ts';
import { createRefreshJob } from '../src/application/refreshJob.ts';
import type { SearchInput } from '../src/application/searchOffers.ts';
import { addDays, dayOf, daysBetween } from '../src/domain/dates.ts';
import { createMemoryHistory } from '../src/infrastructure/persistence/memoryHistory.ts';

/** Mediodía en México de un día dado, en milisegundos. */
const noonMx = (day: string) => Date.parse(`${day}T12:00:00-06:00`);

const row = (storeId: string, externalId: string, price: number, listPrice: number | null = null): PriceRecord => ({
  country: 'MX',
  storeId,
  externalId,
  title: `Producto ${externalId}`,
  brand: 'Marca',
  price,
  listPrice,
  currency: 'MXN',
  url: `https://x/${storeId}/${externalId}`,
});

describe('fechas en hora de México', () => {
  it('convierte un instante a su día de calendario en México, no en UTC', () => {
    // 23:30 del 7-nov en México ya es 8-nov en UTC.
    expect(dayOf(Date.parse('2026-11-07T23:30:00-06:00'))).toBe('2026-11-07');
    expect(addDays('2026-11-07', -7)).toBe('2026-10-31');
    expect(daysBetween('2026-10-31', '2026-11-07')).toBe(7);
  });
});

describe('historial de precios por periodo', () => {
  function setup() {
    let now = noonMx('2026-11-01');
    const history = createMemoryHistory(() => now);
    const service = createHistoryService({ history, clock: { now: () => now }, storeName: (id) => (id === 'elektra' ? 'Elektra' : null) });
    const travel = (day: string) => {
      now = noonMx(day);
    };
    return { history, service, travel };
  }

  it('un punto por día con el precio mínimo de ese día, y resumen por tienda', async () => {
    const { history, service, travel } = setup();
    await history.recordPrices([row('elektra', 'A1', 1000, 1200), row('amazon', 'B2', 1100)]);
    await history.recordPrices([row('elektra', 'A1', 950)]); // mismo día, más barato
    travel('2026-11-03');
    await history.recordPrices([row('elektra', 'A1', 900)]);
    travel('2026-11-05');

    const res = await service.priceHistory('MX', [{ storeId: 'elektra', externalId: 'A1' }, { storeId: 'amazon', externalId: 'B2' }], null, null);
    expect(res.since).toBe('2026-11-01');
    expect(res.to).toBe('2026-11-05');
    expect(res.from).toBe('2026-11-01'); // no promete más atrás de lo que hay
    const elektra = res.items.find((i) => i.storeId === 'elektra')!;
    expect(elektra.storeName).toBe('Elektra');
    expect(elektra.points).toEqual([
      { date: '2026-11-01', price: 950, listPrice: 1200 },
      { date: '2026-11-03', price: 900, listPrice: null },
    ]);
    expect(elektra).toMatchObject({ min: 900, max: 950, first: 950, last: 900, firstSeen: '2026-11-01', lastSeen: '2026-11-03' });
    // Ordenado por el precio más reciente: la más barata hoy primero.
    expect(res.items.map((i) => i.storeId)).toEqual(['elektra', 'amazon']);
  });

  it('respeta el periodo pedido y rechaza uno al revés', async () => {
    const { history, service, travel } = setup();
    await history.recordPrices([row('elektra', 'A1', 1000)]);
    travel('2026-11-10');
    await history.recordPrices([row('elektra', 'A1', 800)]);
    travel('2026-11-12');

    const soloNov10 = await service.priceHistory('MX', [{ storeId: 'elektra', externalId: 'A1' }], '2026-11-10', '2026-11-10');
    expect(soloNov10.items[0]!.points.map((p) => p.date)).toEqual(['2026-11-10']);
    await expect(service.priceHistory('MX', [], '2026-11-12', '2026-11-01')).rejects.toBeInstanceOf(HistoryRangeError);
  });

  it('sin datos: cobertura vacía y respuesta sin productos', async () => {
    const { service } = setup();
    expect(await service.coverage('MX')).toEqual({ country: 'MX', since: null, until: null, snapshots: 0, items: 0 });
    expect((await service.priceHistory('MX', [{ storeId: 'x', externalId: '1' }], null, null)).items).toEqual([]);
  });
});

describe('refresco programado', () => {
  it('vuelve a buscar los términos más repetidos saltándose la caché', async () => {
    const history = createMemoryHistory();
    await history.recordSearch({ query: 'iphone 15', country: 'MX', resultCount: 10, storeCount: 3 });
    await history.recordSearch({ query: 'iphone 15', country: 'MX', resultCount: 10, storeCount: 3 });
    await history.recordSearch({ query: 'pantalla samsung 55', country: 'MX', resultCount: 5, storeCount: 2 });
    await history.recordSearch({ query: 'nada', country: 'MX', resultCount: 0, storeCount: 0 }); // sin resultados: no cuenta
    const calls: SearchInput[] = [];
    const job = createRefreshJob({
      history,
      clock: { now: () => 0 },
      maxTerms: 10,
      concurrency: 2,
      search: async (input) => {
        calls.push(input);
        return { totalOffers: 7 } as never;
      },
    });
    const res = await job.run('MX');
    expect(res).toMatchObject({ terms: 2, searches: 2, offers: 14 });
    expect(calls.map((c) => c.query).sort()).toEqual(['iphone 15', 'pantalla samsung 55']);
    expect(calls.every((c) => c.fresh === true)).toBe(true);
  });
});
