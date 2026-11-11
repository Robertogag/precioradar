import type { StatsDay, StatsQuery, StatsStore, StoreRunStatus } from '../../../../shared/contracts.ts';
import type { CoverageInfo, ItemRef, PriceRecord, PriceSeries, SearchHistory, SearchRecord, UsageReport } from '../../application/ports.ts';
import { dayOf } from '../../domain/dates.ts';
import type { LearnedTerm } from '../../domain/suggest.ts';
import { normalize } from '../../domain/text.ts';

const MAX_PRICES = 20_000;
/** Cuántas búsquedas lista el reporte de uso en "lo más buscado" y "sin resultados". */
export const USAGE_TOP = 15;

interface Stored {
  row: PriceRecord;
  at: number;
}

/**
 * Memoria en el proceso: sirve para desarrollo, pruebas y para arrancar sin base de datos.
 * Se pierde al reiniciar; en producción va Postgres (pgHistory.ts) con el mismo contrato.
 */
export function createMemoryHistory(now: () => number = Date.now): SearchHistory & { searches: SearchRecord[]; prices: PriceRecord[] } {
  const terms = new Map<string, { text: string; hits: number; lastAt: number }>();
  const searches: SearchRecord[] = [];
  const searchLog: { record: SearchRecord; at: number }[] = [];
  const storeDaily = new Map<string, { country: string; day: string; storeId: string; status: StoreRunStatus; runs: number; totalMs: number }>();
  const stored: Stored[] = [];

  return {
    searches,
    get prices() {
      return stored.map((s) => s.row);
    },
    async recordSearch(record) {
      searches.push(record);
      searchLog.push({ record, at: now() });
      // Lo que busca el refresco automático no es de nadie: no alimenta lo más buscado ni las sugerencias.
      if (record.origin === 'refresco') return;
      if (record.resultCount <= 0) return;
      const norm = normalize(record.query);
      if (norm.length < 3) return;
      const key = `${record.country}|${norm}`;
      const current = terms.get(key);
      if (current) {
        current.hits += 1;
        current.text = record.query.trim();
        current.lastAt = now();
      } else {
        terms.set(key, { text: record.query.trim(), hits: 1, lastAt: now() });
      }
    },
    async recordPrices(rows) {
      const at = now();
      stored.push(...rows.map((row) => ({ row, at })));
      if (stored.length > MAX_PRICES) stored.splice(0, stored.length - MAX_PRICES);
    },
    async learnedTerms(country, prefix, limit): Promise<LearnedTerm[]> {
      const p = normalize(prefix);
      if (!p) return [];
      const head = `${country}|`;
      return [...terms.entries()]
        .filter(([key]) => key.startsWith(head))
        .map(([key, value]) => ({ norm: key.slice(head.length), ...value }))
        .filter((t) => t.norm.startsWith(p) || t.norm.includes(` ${p}`))
        .sort((a, b) => b.hits - a.hits)
        .slice(0, limit)
        .map((t) => ({ text: t.text, hits: t.hits }));
    },
    async lastOffers(country, storeId, words, maxAgeDays, limit) {
      if (words.length === 0) return [];
      const since = now() - maxAgeDays * 86_400_000;
      const latest = new Map<string, Stored>();
      for (const s of stored) {
        if (s.at < since || s.row.country !== country || s.row.storeId !== storeId) continue;
        const title = normalize(s.row.title);
        if (!words.every((w) => title.includes(w))) continue;
        const cur = latest.get(s.row.externalId);
        if (!cur || s.at > cur.at) latest.set(s.row.externalId, s);
      }
      return [...latest.values()]
        .sort((a, b) => b.at - a.at)
        .slice(0, limit)
        .map(({ row, at }) => ({
          externalId: row.externalId,
          title: row.title,
          brand: row.brand,
          price: row.price,
          listPrice: row.listPrice,
          currency: row.currency,
          url: row.url,
          seenAt: new Date(at).toISOString(),
          source: row.source ?? 'tienda',
        }));
    },
    async priceSeries(country, items: ItemRef[], from, toExclusive): Promise<PriceSeries[]> {
      const wanted = new Set(items.map((i) => `${i.storeId}|${i.externalId}`));
      const series = new Map<string, PriceSeries & { days: Map<string, { price: number; listPrice: number | null }> }>();
      for (const s of stored) {
        const key = `${s.row.storeId}|${s.row.externalId}`;
        if (s.row.country !== country || !wanted.has(key)) continue;
        const day = dayOf(s.at);
        if (day < from || day >= toExclusive) continue;
        let entry = series.get(key);
        if (!entry) {
          entry = { storeId: s.row.storeId, externalId: s.row.externalId, title: s.row.title, url: s.row.url, currency: s.row.currency, points: [], days: new Map() };
          series.set(key, entry);
        }
        entry.title = s.row.title;
        entry.url = s.row.url;
        // Como en SQL: el precio mínimo del día y, aparte, el menor precio de lista que se haya visto ese día.
        const cur = entry.days.get(day);
        if (!cur) entry.days.set(day, { price: s.row.price, listPrice: s.row.listPrice });
        else {
          cur.price = Math.min(cur.price, s.row.price);
          if (s.row.listPrice !== null) cur.listPrice = cur.listPrice === null ? s.row.listPrice : Math.min(cur.listPrice, s.row.listPrice);
        }
      }
      return [...series.values()].map(({ days, ...rest }) => ({
        ...rest,
        points: [...days.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, v]) => ({ date, ...v })),
      }));
    },
    async coverage(country): Promise<CoverageInfo> {
      const mine = stored.filter((s) => s.row.country === country);
      if (mine.length === 0) return { since: null, until: null, snapshots: 0, items: 0 };
      const days = mine.map((s) => dayOf(s.at)).sort();
      return {
        since: days[0]!,
        until: days[days.length - 1]!,
        snapshots: mine.length,
        items: new Set(mine.map((s) => `${s.row.storeId}|${s.row.externalId}`)).size,
      };
    },
    async topTerms(country, limit) {
      const head = `${country}|`;
      return [...terms.entries()]
        .filter(([key]) => key.startsWith(head))
        .map(([, v]) => v)
        .sort((a, b) => b.hits - a.hits || b.lastAt - a.lastAt)
        .slice(0, limit)
        .map((t) => t.text);
    },
    async recordStoreRuns(country, runs) {
      const day = dayOf(now());
      for (const r of runs) {
        const key = `${country}|${day}|${r.storeId}|${r.status}`;
        const cur = storeDaily.get(key) ?? { country, day, storeId: r.storeId, status: r.status, runs: 0, totalMs: 0 };
        cur.runs += 1;
        cur.totalMs += r.ms;
        storeDaily.set(key, cur);
      }
    },
    async usage(country, from, toExclusive): Promise<UsageReport> {
      const inRange = searchLog
        .map((s) => ({ ...s, day: dayOf(s.at) }))
        .filter((s) => s.record.country === country && s.day >= from && s.day < toExclusive);
      const people = inRange.filter((s) => s.record.origin !== 'refresco');

      const days = new Map<string, StatsDay & { who: Set<string> }>();
      for (const s of inRange) {
        const d = days.get(s.day) ?? { day: s.day, searches: 0, fromCache: 0, visitors: 0, refresh: 0, who: new Set<string>() };
        if (s.record.origin === 'refresco') d.refresh += 1;
        else {
          d.searches += 1;
          if (s.record.fromCache) d.fromCache += 1;
          if (s.record.visitor) d.who.add(s.record.visitor);
        }
        days.set(s.day, d);
      }
      const daily = [...days.values()]
        .sort((a, b) => (a.day < b.day ? -1 : 1))
        .map(({ who, ...d }) => ({ ...d, visitors: who.size }));

      const rank = (list: typeof people): StatsQuery[] => {
        const byQuery = new Map<string, { query: string; searches: number; results: number; lastAt: number }>();
        for (const s of list) {
          const key = normalize(s.record.query);
          const cur = byQuery.get(key) ?? { query: s.record.query.trim(), searches: 0, results: 0, lastAt: 0 };
          cur.searches += 1;
          cur.results += s.record.resultCount;
          if (s.at >= cur.lastAt) {
            cur.lastAt = s.at;
            cur.query = s.record.query.trim();
          }
          byQuery.set(key, cur);
        }
        return [...byQuery.values()]
          .sort((a, b) => b.searches - a.searches || b.lastAt - a.lastAt)
          .slice(0, USAGE_TOP)
          .map((q) => ({ query: q.query, searches: q.searches, avgResults: Math.round(q.results / q.searches), lastAt: new Date(q.lastAt).toISOString() }));
      };

      const stores = new Map<string, Omit<StatsStore, 'storeName'> & { totalMs: number }>();
      for (const r of storeDaily.values()) {
        if (r.country !== country || r.day < from || r.day >= toExclusive) continue;
        const cur = stores.get(r.storeId) ?? { storeId: r.storeId, runs: 0, ok: 0, empty: 0, failed: 0, avgMs: 0, totalMs: 0 };
        cur.runs += r.runs;
        cur.totalMs += r.totalMs;
        if (r.status === 'ok') cur.ok += r.runs;
        else if (r.status === 'sin-resultados') cur.empty += r.runs;
        else cur.failed += r.runs;
        stores.set(r.storeId, cur);
      }
      return {
        daily,
        topQueries: rank(people),
        noResults: rank(people.filter((s) => s.record.resultCount === 0)),
        stores: [...stores.values()].map(({ totalMs, ...s }) => ({ ...s, avgMs: s.runs > 0 ? Math.round(totalMs / s.runs) : 0 })),
      };
    },
    async close() {},
  };
}
