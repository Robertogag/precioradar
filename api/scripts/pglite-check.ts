// Prueba las consultas reales de pgHistory contra un Postgres embebido (PGlite), sin tocar Cloud SQL:
// corre schema.sql dos veces (debe ser idempotente) y luego graba y lee búsquedas, tiendas y el reporte de uso.
// Uso: PGLITE_PATH=<ruta a @electric-sql/pglite/dist/index.js> npx tsx scripts/pglite-check.ts
import pg from 'pg';
import { pathToFileURL } from 'node:url';

// PGlite no es dependencia del proyecto: se instala aparte (npm i @electric-sql/pglite) y se pasa su ruta.
interface PgliteLike {
  query<T = Record<string, unknown>>(text: string, params?: never[]): Promise<{ rows: T[] }>;
  exec(text: string): Promise<{ rows: unknown[] }[]>;
}
const { PGlite } = (await import(pathToFileURL(process.env.PGLITE_PATH!).href)) as { PGlite: new () => PgliteLike };
const db = new PGlite();

// Un Pool de mentira que manda todo a PGlite: pgHistory no se entera.
class FakePool {
  async query(text: string, params?: unknown[]) {
    if (params && params.length > 0) return db.query(text, params as never[]);
    const res = await db.exec(text);
    return res[res.length - 1] ?? { rows: [] };
  }
  on() {}
  async end() {}
}
(pg as unknown as { Pool: unknown }).Pool = FakePool;

const { createPgHistory } = await import('../src/infrastructure/persistence/pgHistory.ts');
const schema = new URL('../db/schema.sql', import.meta.url);

// Una búsqueda vieja del refresco (6:10 hora de México del 9-nov) para probar la corrección retroactiva.
await db.exec((await import('node:fs')).readFileSync(schema, 'utf8'));
await db.query(`INSERT INTO comparador.searches (country, query, query_norm, result_count, store_count, searched_at) VALUES ('MX','x','x',1,1,'2026-11-09T12:10:00Z'), ('MX','y','y',1,1,'2026-11-09T20:00:00Z')`);

const h = createPgHistory({ connectionString: 'postgres://x', schemaSqlPath: schema });
await h.ready;
console.log('esquema: corre dos veces sin error');
const old = await db.query<{ query: string; origin: string }>(`SELECT query, origin FROM comparador.searches ORDER BY query`);
console.log('corrección retroactiva:', old.rows.map((r) => `${r.query}=${r.origin}`).join(' '));

await h.recordSearch({ query: 'Licuadora Oster', country: 'MX', resultCount: 12, storeCount: 5, origin: 'persona', fromCache: false, visitor: 'v1' });
await h.recordSearch({ query: 'licuadora oster', country: 'MX', resultCount: 12, storeCount: 5, origin: 'persona', fromCache: true, visitor: 'v2' });
await h.recordSearch({ query: 'algo que no existe', country: 'MX', resultCount: 0, storeCount: 0, origin: 'persona', fromCache: false, visitor: 'v2' });
await h.recordSearch({ query: 'pantalla 55', country: 'MX', resultCount: 40, storeCount: 8, origin: 'refresco' });
await h.recordStoreRuns('MX', [
  { storeId: 'amazon', status: 'ok', ms: 2100 },
  { storeId: 'coppel', status: 'tiempo-agotado', ms: 22000 },
]);
await h.recordStoreRuns('MX', [
  { storeId: 'amazon', status: 'bloqueada', ms: 900 },
  { storeId: 'coppel', status: 'ok', ms: 15000 },
]);
console.log('términos aprendidos (sin el refresco):', (await h.topTerms('MX', 10)).join(' · '));

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const u = await h.usage('MX', '2026-11-01', tomorrow);
console.log('por día:', JSON.stringify(u.daily));
console.log('más buscado:', JSON.stringify(u.topQueries.map((q) => [q.query, q.searches, q.avgResults])));
console.log('sin resultados:', JSON.stringify(u.noResults.map((q) => [q.query, q.searches])));
console.log('tiendas:', JSON.stringify(u.stores));
await h.close();
