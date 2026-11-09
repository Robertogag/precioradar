import type { HistoryCoverage, PriceHistoryItem, PriceHistoryResponse } from '../../../shared/contracts.ts';
import { addDays, dayOf, daysBetween } from '../domain/dates.ts';
import type { Clock, ItemRef, SearchHistory } from './ports.ts';

export interface HistoryDeps {
  history: SearchHistory;
  clock: Clock;
  /** Nombre visible de una tienda a partir de su id, o null si ya no existe. */
  storeName: (storeId: string) => string | null;
}

/** Cuántos productos se pueden pedir de una vez (un grupo de resultados cabe de sobra). */
export const MAX_HISTORY_ITEMS = 24;
/** Periodo por omisión cuando el usuario no elige uno. */
const DEFAULT_DAYS = 90;
/** Tope del periodo: más de esto no cabe en una gráfica legible y nadie lo pide. */
const MAX_DAYS = 730;

export class HistoryRangeError extends Error {
  override readonly name = 'HistoryRangeError';
}

/**
 * Caso de uso: el historial de precios de un producto (en todas las tiendas donde se vio) para un periodo.
 * El periodo se ajusta a los datos que hay: nunca se promete más de lo guardado.
 */
export function createHistoryService(deps: HistoryDeps) {
  async function priceHistory(country: string, items: ItemRef[], from: string | null, to: string | null): Promise<PriceHistoryResponse> {
    const cov = await deps.history.coverage(country);
    const today = dayOf(deps.clock.now());
    const toDay = to ?? today;
    const fromDefault = addDays(toDay, -(DEFAULT_DAYS - 1));
    let fromDay = from ?? (cov.since && cov.since > fromDefault ? cov.since : fromDefault);
    if (fromDay > toDay) throw new HistoryRangeError('La fecha inicial no puede ser posterior a la final.');
    if (daysBetween(fromDay, toDay) > MAX_DAYS) fromDay = addDays(toDay, -MAX_DAYS);

    const series = items.length > 0 ? await deps.history.priceSeries(country, items.slice(0, MAX_HISTORY_ITEMS), fromDay, addDays(toDay, 1)) : [];
    const result: PriceHistoryItem[] = series
      .filter((s) => s.points.length > 0)
      .map((s) => {
        const prices = s.points.map((p) => p.price);
        return {
          storeId: s.storeId,
          storeName: deps.storeName(s.storeId),
          externalId: s.externalId,
          title: s.title,
          currency: s.currency,
          url: s.url,
          points: s.points,
          min: Math.min(...prices),
          max: Math.max(...prices),
          first: prices[0]!,
          last: prices[prices.length - 1]!,
          firstSeen: s.points[0]!.date,
          lastSeen: s.points[s.points.length - 1]!.date,
        };
      })
      .sort((a, b) => a.last - b.last);

    return { country, from: fromDay, to: toDay, since: cov.since, items: result };
  }

  async function coverage(country: string): Promise<HistoryCoverage> {
    const cov = await deps.history.coverage(country);
    return { country, ...cov };
  }

  return { priceHistory, coverage };
}

export type HistoryService = ReturnType<typeof createHistoryService>;
