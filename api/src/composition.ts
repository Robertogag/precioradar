import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHistoryService } from './application/history.ts';
import { createLinksService } from './application/links.ts';
import { createObservationsService } from './application/observations.ts';
import type { SearchHistory } from './application/ports.ts';
import { createRefreshJob } from './application/refreshJob.ts';
import { createSearchService } from './application/searchOffers.ts';
import { createSuggestService } from './application/suggest.ts';
import { KNOWN_MODELS } from './domain/models.ts';
import { createBrowserLane, findChromium } from './infrastructure/browser/browserLane.ts';
import { createMemoryCache } from './infrastructure/cache/memoryCache.ts';
import { httpGet, httpGetWithCookies } from './infrastructure/http/httpClient.ts';
import { createMemoryHistory } from './infrastructure/persistence/memoryHistory.ts';
import { createPgHistory } from './infrastructure/persistence/pgHistory.ts';
import { buildRegistry } from './infrastructure/stores/registry.ts';
import type { SecurityOptions } from './interfaces/http/server.ts';

export const VERSION = '0.3.0';

function envFlag(name: string): boolean {
  const v = (process.env[name] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

function envList(name: string): string[] | null {
  const items = (process.env[name] ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

/** Postgres si hay DATABASE_URL; si no, memoria del proceso (desarrollo, pruebas, arranque sin base). */
function chooseHistory(log: (m: string) => void): SearchHistory {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    log('memoria: sin DATABASE_URL, las búsquedas aprendidas viven solo en este proceso.');
    return createMemoryHistory();
  }
  const caPath = process.env.DATABASE_SSL_CA?.trim();
  const ssl = caPath ? { ca: readFileSync(caPath, 'utf8'), rejectUnauthorized: true } : envFlag('DATABASE_SSL') ? { rejectUnauthorized: true } : undefined;
  const history = createPgHistory({
    connectionString: url,
    schemaSqlPath: new URL('../db/schema.sql', import.meta.url),
    ...(ssl !== undefined ? { ssl } : {}),
    log,
  });
  history.ready.then(
    () => log('memoria: Postgres listo (esquema comparador).'),
    (err: unknown) => log(`memoria: Postgres no respondió al arrancar: ${err instanceof Error ? err.message : String(err)}`),
  );
  return history;
}

/** Dónde está la app web compilada. WEB_DIST manda; si no, ../web/dist si existe. */
function chooseWebDist(): string | null {
  const fromEnv = process.env.WEB_DIST?.trim();
  if (fromEnv) return existsSync(fromEnv) ? fromEnv : null;
  const byDefault = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  return existsSync(byDefault) ? byDefault : null;
}

/** Arma el sistema real: tiendas de verdad, reloj de verdad, memoria de verdad. Las pruebas arman el suyo con dobles. */
export function compose(log: (message: string) => void = console.log) {
  const envFile = new URL('../.env', import.meta.url);
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const clock = { now: () => Date.now() };
  const cache = createMemoryCache(clock);
  const history = chooseHistory(log);
  const onHistoryError = (err: unknown) => log(`memoria: ${err instanceof Error ? err.message : String(err)}`);

  // Carril de navegador para Coppel y Sears: solo si hay Chromium (la imagen de Playwright en Cloud Run, o el de esta PC).
  const chromiumPath = envFlag('BROWSER_STORES_OFF') ? null : findChromium();
  const lane = chromiumPath ? createBrowserLane({ executablePath: chromiumPath, concurrency: Number(process.env.BROWSER_CONCURRENCY ?? 2), log }) : null;
  log(lane ? `navegador: Chromium en ${chromiumPath}` : 'navegador: sin Chromium; Coppel y Sears quedan como bloqueadas.');

  const registry = buildRegistry(
    { plain: httpGet, withCookies: httpGetWithCookies },
    { clientId: process.env.MELI_CLIENT_ID, clientSecret: process.env.MELI_CLIENT_SECRET },
    lane,
  );
  // Enlaces a tiendas que no se consultan: caché propia (una entrada por producto) para no desplazar a la de búsquedas.
  const links = createLinksService({
    linkers: registry.linkers,
    cache: createMemoryCache(clock, 3_000),
    timeoutMs: 4_000,
    concurrency: 3,
    hitTtlMs: 24 * 60 * 60_000,
    missTtlMs: 60 * 60_000,
    onError: (storeId, err) => log(`enlaces ${storeId}: ${err instanceof Error ? err.message : String(err)}`),
  });
  const service = createSearchService({
    stores: registry.adapters,
    cache,
    clock,
    storeTimeoutMs: Number(process.env.STORE_TIMEOUT_MS ?? 12_000),
    perStoreLimit: 40,
    searchTtlMs: 10 * 60_000,
    dealsTtlMs: 30 * 60_000,
    history,
    onHistoryError,
    links,
    // Última respuesta buena por tienda y búsqueda (12 h): cubre el captcha intermitente de Amazon desde la nube.
    storeMemory: createMemoryCache(clock, 4_000),
  });
  const suggester = createSuggestService({ models: KNOWN_MODELS, history, cache, learnedTtlMs: 60_000, onHistoryError });
  const storeNames = new Map(registry.catalog.map((s) => [s.id, s.name]));
  const historyService = createHistoryService({ history, clock, storeName: (id) => storeNames.get(id) ?? null });
  const job = createRefreshJob({
    search: service.search,
    history,
    clock,
    maxTerms: Number(process.env.REFRESH_MAX_TERMS ?? 40),
    concurrency: Number(process.env.REFRESH_CONCURRENCY ?? 3),
  });

  const security: SecurityOptions = {
    allowedOrigins: envList('ALLOWED_ORIGINS'),
    trustProxy: envFlag('TRUST_PROXY'),
    rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 120),
    searchesPerMinute: Number(process.env.SEARCHES_PER_MINUTE ?? 30),
    webDist: chooseWebDist(),
  };

  const jobKey = process.env.JOB_KEY?.trim() || null;
  if (!jobKey) log('refresco: sin JOB_KEY, el refresco programado está apagado.');

  // Precios vistos por personas en la app (Mercado Libre): se guardan en el historial con origen 'usuario'.
  const observations = createObservationsService({ history, onError: (err) => log(`observaciones: ${err instanceof Error ? err.message : String(err)}`) });

  return { service, suggester, historyService, links, observations, job, jobKey, registry, history, security, lane };
}
