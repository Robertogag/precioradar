import type { CoverageInfo, ItemRef, PriceRecord, PriceSeries, SearchHistory, SearchRecord } from '../../application/ports.ts';
import { dayOf } from '../../domain/dates.ts';
import type { LearnedTerm } from '../../domain/suggest.ts';
import { normalize } from '../../domain/text.ts';

const MAX_PRICES = 20_000;

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
  const stored: Stored[] = [];

  return {
    searches,
    get prices() {
      return stored.map((s) => s.row);
    },
    async recordSearch(record) {
      searches.push(record);
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
    async close() {},
  };
}
