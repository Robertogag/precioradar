import type { StatsDay, StatsResponse } from '../../../shared/contracts.ts';
import { addDays, dayOf } from '../domain/dates.ts';
import type { Clock, SearchHistory } from './ports.ts';

export interface StatsDeps {
  history: SearchHistory;
  clock: Clock;
  storeName: (storeId: string) => string | null;
}

/** Hasta cuántos días atrás deja ver el reporte. */
export const MAX_STATS_DAYS = 90;

/**
 * Reporte privado de uso: búsquedas de personas por día (y cuántas salieron de caché), personas distintas por día,
 * búsquedas del refresco aparte, lo más buscado, lo que nadie encontró y qué tan seguido contesta cada tienda.
 */
export function createStatsService(deps: StatsDeps) {
  async function report(country: string, days: number): Promise<StatsResponse> {
    const span = Math.max(1, Math.min(MAX_STATS_DAYS, Math.round(days)));
    const today = dayOf(deps.clock.now());
    const from = addDays(today, -(span - 1));
    const usage = await deps.history.usage(country, from, addDays(today, 1));

    // Todos los días del periodo, también los que no tuvieron búsquedas: el hueco también dice algo.
    const byDay = new Map(usage.daily.map((d) => [d.day, d]));
    const daily: StatsDay[] = [];
    for (let day = from; day <= today; day = addDays(day, 1)) {
      daily.push(byDay.get(day) ?? { day, searches: 0, fromCache: 0, visitors: 0, refresh: 0 });
    }
    const sum = (pick: (d: StatsDay) => number) => daily.reduce((n, d) => n + pick(d), 0);

    return {
      country,
      from,
      to: today,
      totals: {
        searches: sum((d) => d.searches),
        fromCache: sum((d) => d.fromCache),
        // El código de visitante cambia cada día: se suman las personas de cada día (visitas), no personas únicas.
        visits: sum((d) => d.visitors),
        refresh: sum((d) => d.refresh),
      },
      daily,
      topQueries: usage.topQueries,
      noResults: usage.noResults,
      stores: usage.stores
        .map((s) => ({ ...s, storeName: deps.storeName(s.storeId) ?? s.storeId }))
        .sort((a, b) => b.failed / Math.max(1, b.runs) - a.failed / Math.max(1, a.runs) || b.runs - a.runs),
      generatedAt: new Date(deps.clock.now()).toISOString(),
    };
  }

  return { report };
}

export type StatsService = ReturnType<typeof createStatsService>;
