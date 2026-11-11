import { readFileSync } from 'node:fs';
import pg from 'pg';
import type { StatsQuery } from '../../../../shared/contracts.ts';
import type {
  CoverageInfo,
  ItemRef,
  PriceRecord,
  PriceSeries,
  RememberedOffer,
  SearchHistory,
  SearchRecord,
  StoreRunRecord,
  UsageReport,
} from '../../application/ports.ts';
import { TIME_ZONE } from '../../domain/dates.ts';
import type { LearnedTerm } from '../../domain/suggest.ts';
import { normalize } from '../../domain/text.ts';
import { USAGE_TOP } from './memoryHistory.ts';

export interface PgHistoryOptions {
  /** postgres://usuario:clave@host:5432/base, o con ?host=/cloudsql/PROYECTO:REGION:INSTANCIA en Cloud Run. */
  connectionString: string;
  /** Ruta del schema.sql; se corre en cada arranque (es idempotente). */
  schemaSqlPath: URL | string;
  ssl?: pg.PoolConfig['ssl'];
  log?: (message: string) => void;
}

/** `%` y `_` son comodines de LIKE; lo que escribe el usuario se busca literal. */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

const num = (v: unknown): number => Number(v);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/**
 * Memoria en Postgres (Cloud SQL). Todas las consultas van con parámetros ($1, $2…): nunca se concatena texto
 * del usuario en el SQL. Pocas conexiones (Cloud Run levanta varias copias) y tiempos cortos: si la base se
 * tarda, la búsqueda no espera por ella.
 */
export function createPgHistory(opts: PgHistoryOptions): SearchHistory & { ready: Promise<void> } {
  const pool = new pg.Pool({
    connectionString: opts.connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 8_000,
    application_name: 'comparador-api',
    ...(opts.ssl !== undefined ? { ssl: opts.ssl } : {}),
  });
  pool.on('error', (err) => opts.log?.(`postgres: ${err.message}`));

  const ready = pool.query(readFileSync(opts.schemaSqlPath, 'utf8')).then(() => undefined);

  return {
    ready,

    async recordSearch(record: SearchRecord) {
      await ready;
      const norm = normalize(record.query);
      const origin = record.origin ?? 'persona';
      await pool.query(
        `INSERT INTO comparador.searches (country, query, query_norm, result_count, store_count, origin, from_cache, visitor)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [record.country, record.query.trim().slice(0, 120), norm, record.resultCount, record.storeCount, origin, record.fromCache === true, record.visitor ?? null],
      );
      // Lo que busca el refresco automático no es de nadie: no alimenta lo más buscado ni las sugerencias.
      if (origin === 'refresco') return;
      if (record.resultCount <= 0 || norm.length < 3 || norm.length > 80) return;
      await pool.query(
        `INSERT INTO comparador.terms (country, term_norm, term, hits, last_at)
         VALUES ($1, $2, $3, 1, now())
         ON CONFLICT (country, term_norm)
         DO UPDATE SET hits = comparador.terms.hits + 1, term = EXCLUDED.term, last_at = now()`,
        [record.country, norm, record.query.trim()],
      );
    },

    async recordPrices(rows: PriceRecord[]) {
      if (rows.length === 0) return;
      await ready;
      await pool.query(
        `INSERT INTO comparador.price_snapshots (country, store_id, external_id, title, brand, price, list_price, currency, url, source)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::numeric[], $7::numeric[], $8::text[], $9::text[], $10::text[])`,
        [
          rows.map((r) => r.country),
          rows.map((r) => r.storeId),
          rows.map((r) => r.externalId),
          rows.map((r) => r.title.slice(0, 300)),
          rows.map((r) => r.brand),
          rows.map((r) => r.price),
          rows.map((r) => r.listPrice),
          rows.map((r) => r.currency),
          rows.map((r) => r.url.slice(0, 1000)),
          rows.map((r) => r.source ?? 'tienda'),
        ],
      );
    },

    async learnedTerms(country: string, prefix: string, limit: number): Promise<LearnedTerm[]> {
      await ready;
      const p = escapeLike(normalize(prefix));
      if (!p) return [];
      const { rows } = await pool.query<{ term: string; hits: number }>(
        `SELECT term, hits FROM comparador.terms
         WHERE country = $1 AND (term_norm LIKE $2 ESCAPE '\\' OR term_norm LIKE $3 ESCAPE '\\')
         ORDER BY hits DESC, last_at DESC
         LIMIT $4`,
        [country, `${p}%`, `% ${p}%`, Math.max(1, Math.min(limit, 200))],
      );
      return rows.map((r) => ({ text: r.term, hits: Number(r.hits) }));
    },

    async priceSeries(country: string, items: ItemRef[], from: string, toExclusive: string): Promise<PriceSeries[]> {
      if (items.length === 0) return [];
      await ready;
      // Un punto por producto y día (el precio mínimo de ese día), en la hora de México.
      const { rows } = await pool.query<{
        store_id: string;
        external_id: string;
        day: string;
        price: string;
        list_price: string | null;
        title: string;
        url: string;
        currency: string;
      }>(
        `WITH wanted AS (SELECT * FROM unnest($2::text[], $3::text[]) AS w(store_id, external_id))
         SELECT s.store_id, s.external_id,
                to_char((s.seen_at AT TIME ZONE $6)::date, 'YYYY-MM-DD') AS day,
                min(s.price) AS price,
                min(s.list_price) AS list_price,
                (array_agg(s.title ORDER BY s.seen_at DESC))[1] AS title,
                (array_agg(s.url ORDER BY s.seen_at DESC))[1] AS url,
                (array_agg(s.currency ORDER BY s.seen_at DESC))[1] AS currency
         FROM comparador.price_snapshots s
         JOIN wanted w ON w.store_id = s.store_id AND w.external_id = s.external_id
         WHERE s.country = $1
           AND s.seen_at >= ($4::date::timestamp AT TIME ZONE $6)
           AND s.seen_at <  ($5::date::timestamp AT TIME ZONE $6)
         GROUP BY s.store_id, s.external_id, day
         ORDER BY s.store_id, s.external_id, day`,
        [country, items.map((i) => i.storeId), items.map((i) => i.externalId), from, toExclusive, TIME_ZONE],
      );
      const series = new Map<string, PriceSeries>();
      for (const r of rows) {
        const key = `${r.store_id}|${r.external_id}`;
        let entry = series.get(key);
        if (!entry) {
          entry = { storeId: r.store_id, externalId: r.external_id, title: r.title, url: r.url, currency: r.currency, points: [] };
          series.set(key, entry);
        }
        entry.title = r.title;
        entry.url = r.url;
        entry.points.push({ date: r.day, price: num(r.price), listPrice: numOrNull(r.list_price) });
      }
      return [...series.values()];
    },

    async coverage(country: string): Promise<CoverageInfo> {
      await ready;
      const { rows } = await pool.query<{ since: string | null; until: string | null; snapshots: string; items: string }>(
        `SELECT to_char(min(seen_at AT TIME ZONE $2), 'YYYY-MM-DD') AS since,
                to_char(max(seen_at AT TIME ZONE $2), 'YYYY-MM-DD') AS until,
                count(*) AS snapshots,
                count(DISTINCT (store_id, external_id)) AS items
         FROM comparador.price_snapshots WHERE country = $1`,
        [country, TIME_ZONE],
      );
      const r = rows[0];
      return { since: r?.since ?? null, until: r?.until ?? null, snapshots: num(r?.snapshots ?? 0), items: num(r?.items ?? 0) };
    },

    async lastOffers(country: string, storeId: string, words: string[], maxAgeDays: number, limit: number): Promise<RememberedOffer[]> {
      if (words.length === 0) return [];
      const patterns = words.map((w) => `%${w.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
      const { rows } = await pool.query<{
        external_id: string;
        title: string;
        brand: string | null;
        price: string;
        list_price: string | null;
        currency: string;
        url: string;
        seen_at: Date;
        source: string;
      }>(
        `SELECT DISTINCT ON (external_id) external_id, title, brand, price, list_price, currency, url, seen_at, source
         FROM comparador.price_snapshots
         WHERE country = $1 AND store_id = $2 AND seen_at > now() - ($3 || ' days')::interval AND title ILIKE ALL ($4::text[])
         ORDER BY external_id, seen_at DESC
         LIMIT $5`,
        [country, storeId, String(maxAgeDays), patterns, limit],
      );
      return rows.map((r) => ({
        externalId: r.external_id,
        title: r.title,
        brand: r.brand,
        price: Number(r.price),
        listPrice: r.list_price === null ? null : Number(r.list_price),
        currency: r.currency,
        url: r.url,
        seenAt: r.seen_at.toISOString(),
        source: r.source === 'usuario' ? 'usuario' : 'tienda',
      }));
    },
    async topTerms(country: string, limit: number): Promise<string[]> {
      await ready;
      const { rows } = await pool.query<{ term: string }>(
        'SELECT term FROM comparador.terms WHERE country = $1 ORDER BY hits DESC, last_at DESC LIMIT $2',
        [country, Math.max(1, Math.min(limit, 200))],
      );
      return rows.map((r) => r.term);
    },

    async recordStoreRuns(country: string, runs: StoreRunRecord[]) {
      if (runs.length === 0) return;
      await ready;
      await pool.query(
        `INSERT INTO comparador.store_daily (country, day, store_id, status, runs, total_ms)
         SELECT $1, (now() AT TIME ZONE $2)::date, t.store_id, t.status, 1, t.ms
           FROM unnest($3::text[], $4::text[], $5::bigint[]) AS t(store_id, status, ms)
         ON CONFLICT (country, day, store_id, status)
         DO UPDATE SET runs = comparador.store_daily.runs + 1, total_ms = comparador.store_daily.total_ms + EXCLUDED.total_ms`,
        [country, TIME_ZONE, runs.map((r) => r.storeId), runs.map((r) => r.status), runs.map((r) => Math.round(r.ms))],
      );
    },

    async usage(country: string, from: string, toExclusive: string): Promise<UsageReport> {
      await ready;
      // El rango y el día se cuentan en hora de México; el índice (country, searched_at) acota la lectura.
      const range = `country = $1 AND searched_at >= ($2::date::timestamp AT TIME ZONE $4) AND searched_at < ($3::date::timestamp AT TIME ZONE $4)`;
      const params = [country, from, toExclusive, TIME_ZONE];
      const ranked = (extra: string) =>
        pool.query<{ query: string; searches: string; avg_results: string; last_at: Date }>(
          `SELECT (array_agg(query ORDER BY searched_at DESC))[1] AS query, count(*) AS searches,
                  round(avg(result_count)) AS avg_results, max(searched_at) AS last_at
             FROM comparador.searches
            WHERE ${range} AND origin = 'persona' ${extra}
            GROUP BY query_norm
            ORDER BY count(*) DESC, max(searched_at) DESC
            LIMIT ${USAGE_TOP}`,
          params,
        );
      const [daily, top, none, stores] = await Promise.all([
        pool.query<{ day: string; searches: string; from_cache: string; visitors: string; refresh: string }>(
          `SELECT ((searched_at AT TIME ZONE $4)::date)::text AS day,
                  count(*) FILTER (WHERE origin = 'persona') AS searches,
                  count(*) FILTER (WHERE origin = 'persona' AND from_cache) AS from_cache,
                  count(DISTINCT visitor) FILTER (WHERE origin = 'persona') AS visitors,
                  count(*) FILTER (WHERE origin = 'refresco') AS refresh
             FROM comparador.searches
            WHERE ${range}
            GROUP BY 1
            ORDER BY 1`,
          params,
        ),
        ranked(''),
        ranked('AND result_count = 0'),
        pool.query<{ store_id: string; runs: string; ok: string; empty: string; total_ms: string }>(
          `SELECT store_id, sum(runs) AS runs,
                  coalesce(sum(runs) FILTER (WHERE status = 'ok'), 0) AS ok,
                  coalesce(sum(runs) FILTER (WHERE status = 'sin-resultados'), 0) AS empty,
                  sum(total_ms) AS total_ms
             FROM comparador.store_daily
            WHERE country = $1 AND day >= $2::date AND day < $3::date
            GROUP BY store_id`,
          [country, from, toExclusive],
        ),
      ]);
      const query = (r: { query: string; searches: string; avg_results: string; last_at: Date }): StatsQuery => ({
        query: r.query,
        searches: num(r.searches),
        avgResults: num(r.avg_results),
        lastAt: r.last_at.toISOString(),
      });
      return {
        daily: daily.rows.map((r) => ({ day: r.day, searches: num(r.searches), fromCache: num(r.from_cache), visitors: num(r.visitors), refresh: num(r.refresh) })),
        topQueries: top.rows.map(query),
        noResults: none.rows.map(query),
        stores: stores.rows.map((r) => {
          const runs = num(r.runs);
          return {
            storeId: r.store_id,
            runs,
            ok: num(r.ok),
            empty: num(r.empty),
            failed: runs - num(r.ok) - num(r.empty),
            avgMs: runs > 0 ? Math.round(num(r.total_ms) / runs) : 0,
          };
        }),
      };
    },

    async close() {
      await pool.end();
    },
  };
}
