import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance, type FastifyPluginAsync, type FastifyRequest } from 'fastify';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { z } from 'zod';
import type {
  ApiError,
  CountryInfo,
  HistoryCoverage,
  PriceHistoryResponse,
  ObservationsResponse,
  RefreshJobResult,
  StatsResponse,
  StoreInfo,
  StoreLinksResponse,
  SuggestResponse,
} from '../../../../shared/contracts.ts';
import { HistoryRangeError, type HistoryService, MAX_HISTORY_ITEMS } from '../../application/history.ts';
import type { LinksService } from '../../application/links.ts';
import type { ObservationsService } from '../../application/observations.ts';
import type { RefreshJob } from '../../application/refreshJob.ts';
import { MAX_STATS_DAYS, type StatsService } from '../../application/stats.ts';
import { EmptyQueryError, type SearchService } from '../../application/searchOffers.ts';
import type { SuggestService } from '../../application/suggest.ts';
import { dayOf, isDay } from '../../domain/dates.ts';
import { tokenize } from '../../domain/text.ts';
import { isKnownCountry, isKnownState, listCountries } from '../../infrastructure/catalog/countries.ts';

const flag = z
  .enum(['0', '1', 'true', 'false'])
  .default('0')
  .transform((v) => v === '1' || v === 'true');

const country = z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, 'País inválido.').default('MX');

const searchQuery = z.object({
  q: z.string().trim().min(2, 'Escribe al menos 2 letras.').max(120, 'La búsqueda es demasiado larga.'),
  country,
  state: z.string().trim().toUpperCase().max(5).optional(),
  sort: z.enum(['relevancia', 'precio', 'descuento']).default('relevancia'),
  accesorios: flag,
  reacondicionados: flag,
  exacto: flag,
});

const countryQuery = z.object({ country });

const statsQuery = z.object({ country, days: z.coerce.number().int().min(1).max(MAX_STATS_DAYS).default(14) });

const linksQuery = z.object({
  country,
  title: z.string().trim().min(2, 'Falta el nombre del producto.').max(160, 'El nombre es demasiado largo.'),
  brand: z.string().trim().max(60).optional(),
});

/** Precios que una persona vio en la app al abrir la página de una tienda asistida. Pocos por envío; el resto se valida en el servicio. */
const observationsBody = z.object({
  country,
  items: z
    .array(
      z.object({
        url: z.string().trim().url().max(1000),
        title: z.string().trim().min(3).max(300),
        price: z.number().positive().max(2_000_000),
        listPrice: z.number().positive().max(2_000_000).nullable().optional(),
        currency: z.string().trim().length(3).optional(),
      }),
    )
    .min(1)
    .max(20),
});

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD).').refine(isDay, 'Fecha inválida.');

/** items=tienda:id,tienda:id (el id puede llevar dos puntos; se parte en el primero). */
const historyQuery = z.object({
  country,
  items: z
    .string()
    .min(1)
    .max(2000)
    .transform((raw) =>
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, MAX_HISTORY_ITEMS)
        .map((s) => {
          const at = s.indexOf(':');
          return at > 0 ? { storeId: s.slice(0, at), externalId: s.slice(at + 1) } : null;
        })
        .filter((x): x is { storeId: string; externalId: string } => x !== null && x.externalId.length > 0),
    ),
  from: day.optional(),
  to: day.optional(),
});

const suggestQuery = z.object({
  q: z.string().trim().min(1).max(80, 'La búsqueda es demasiado larga.'),
  country,
  limit: z.coerce.number().int().min(1).max(12).default(8),
});

export interface SecurityOptions {
  /**
   * Orígenes (https://dominio) con permiso de llamar desde un navegador. null = modo desarrollo: solo
   * localhost y la red local. Las apps nativas y la propia página servida aquí no mandan Origin y pasan siempre.
   */
  allowedOrigins: string[] | null;
  /** true detrás de un proxy que pone X-Forwarded-For (Cloud Run); si no, el límite por IP vería al proxy. */
  trustProxy: boolean;
  /** Peticiones por minuto por IP, en total. */
  rateLimitPerMinute: number;
  /** Búsquedas por minuto por IP: cada una consulta a todas las tiendas, así que es el límite que importa. */
  searchesPerMinute: number;
  /** Carpeta con la app web compilada (web/dist); null = este servidor solo contesta JSON. */
  webDist: string | null;
}

export interface ServerDeps {
  service: SearchService;
  suggester: SuggestService;
  catalog: StoreInfo[];
  version: string;
  security: SecurityOptions;
  logger?: boolean;
  /** Historial de precios por periodo. Sin él, la ruta no existe. */
  history?: HistoryService;
  /** Enlaces a tiendas que no se consultan (la página del producto o su buscador). Sin él, la ruta no existe. */
  links?: LinksService;
  /** Precios vistos por personas en la app (tiendas asistidas). Sin él, la ruta no existe. */
  observations?: ObservationsService;
  /** Refresco programado de precios. Sin él (o sin `jobKey`), la ruta responde 404. */
  job?: RefreshJob;
  /** Clave que debe traer Cloud Scheduler en X-Job-Key para disparar el refresco. */
  jobKey?: string | null;
  /** Reporte privado de uso. Sin él (o sin `statsKey`), la ruta responde 404. */
  stats?: StatsService;
  /** Llave que debe traer quien pide el reporte de uso, en X-Stats-Key. */
  statsKey?: string | null;
  /**
   * Secreto para el código de visitante del día (HMAC de día + IP + navegador). Sin él no se calcula. La IP solo
   * se usa en ese momento: lo que se guarda es el código, que cambia cada día y no se puede revertir.
   */
  visitorKey?: string | null;
  /** Reloj para el día del código de visitante (las pruebas lo fijan). */
  now?: () => number;
}

/** Compara una llave recibida con la esperada sin filtrar por el tiempo cuántos caracteres coinciden. */
function sameKey(given: unknown, expected: string): boolean {
  return typeof given === 'string' && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

const PRIVATE_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/;

/** ¿Puede este origen (navegador) usar la API? Sin Origin (app nativa, misma página, curl) siempre sí. */
export function isAllowedOrigin(origin: string | undefined, allowed: string[] | null): boolean {
  if (origin === undefined) return true;
  if (allowed) return allowed.includes(origin);
  try {
    const u = new URL(origin);
    return (u.protocol === 'http:' || u.protocol === 'https:') && PRIVATE_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Política de contenido de la app web servida desde aquí. Solo corre código de este origen; las imágenes de
 * producto vienen de las tiendas (https). La misma política va en web/index.html por si se sirve desde otro lado.
 */
const CONTENT_SECURITY_POLICY: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': ["'self'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'https:', 'data:'],
  // Vite incrusta como data: los subconjuntos pequeños de la tipografía.
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'object-src': ["'none'"],
};

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const sec = deps.security;
  const app = Fastify({
    logger: deps.logger === false ? false : { level: process.env.LOG_LEVEL ?? 'info' },
    trustProxy: sec.trustProxy,
    bodyLimit: 16 * 1024,
    requestTimeout: 30_000,
  });

  await app.register(helmet, {
    contentSecurityPolicy: { useDefaults: false, directives: CONTENT_SECURITY_POLICY },
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cors, {
    origin: (origin, cb) => cb(null, isAllowedOrigin(origin, sec.allowedOrigins)),
    methods: ['GET'],
    maxAge: 600,
  });
  await app.register(rateLimit, { global: true, max: sec.rateLimitPerMinute, timeWindow: '1 minute' });

  const fail = (statusCode: number, error: string, message: string) => ({ statusCode, body: { error, message } satisfies ApiError });

  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof z.ZodError) {
      const f = fail(400, 'peticion-invalida', err.issues[0]?.message ?? 'Petición inválida.');
      return reply.status(f.statusCode).send(f.body);
    }
    if (err instanceof EmptyQueryError) {
      const f = fail(400, 'busqueda-vacia', err.message);
      return reply.status(f.statusCode).send(f.body);
    }
    if (err instanceof HistoryRangeError) {
      const f = fail(400, 'periodo-invalido', err.message);
      return reply.status(f.statusCode).send(f.body);
    }
    const statusCode = typeof err === 'object' && err !== null && 'statusCode' in err ? Number(err.statusCode) : 500;
    if (statusCode === 429) {
      const f = fail(429, 'demasiadas-peticiones', 'Demasiadas peticiones seguidas. Espera un minuto.');
      return reply.status(f.statusCode).send(f.body);
    }
    if (statusCode >= 400 && statusCode < 500) {
      const f = fail(statusCode, 'peticion-invalida', 'Petición inválida.');
      return reply.status(f.statusCode).send(f.body);
    }
    app.log.error(err);
    const f = fail(500, 'error-interno', 'Algo falló en el servidor.');
    return reply.status(f.statusCode).send(f.body);
  });

  const routes: FastifyPluginAsync = async (api) => {
    api.get('/health', async () => ({
      ok: true,
      version: deps.version,
      activeStores: deps.catalog.filter((s) => s.availability === 'activa').length,
    }));

    api.get('/countries', async (_req, reply): Promise<CountryInfo[]> => {
      reply.header('Cache-Control', 'public, max-age=3600');
      return listCountries(deps.catalog);
    });

    api.get('/stores', async (req, reply): Promise<StoreInfo[]> => {
      const p = countryQuery.parse(req.query);
      reply.header('Cache-Control', 'public, max-age=3600');
      return deps.catalog.filter((s) => s.country === p.country);
    });

    api.get('/suggest', async (req, reply): Promise<SuggestResponse> => {
      const p = suggestQuery.parse(req.query);
      reply.header('Cache-Control', 'public, max-age=60');
      return deps.suggester.forQuery(p.q, p.country, p.limit);
    });

    if (deps.observations) {
      const observations = deps.observations;
      // La app manda el precio que Mercado Libre le mostró a la persona al abrir la página. Límite propio por IP.
      api.post('/observations', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req, reply): Promise<ObservationsResponse> => {
        const p = observationsBody.parse(req.body);
        reply.status(202);
        return observations.record(p.country, p.items);
      });
    }

    if (deps.links) {
      const links = deps.links;
      // La página exacta del producto en las tiendas que no se consultan (Mercado Libre), o su buscador si no lo reconocen.
      // Es barata para el servidor (caché por producto) y la piden muchas tarjetas: límite propio, más holgado.
      api.get('/links', { config: { rateLimit: { max: 300, timeWindow: '1 minute' } } }, async (req, reply): Promise<StoreLinksResponse> => {
        const p = linksQuery.parse(req.query);
        reply.header('Cache-Control', 'private, max-age=3600');
        return links.resolve(p.country, p.title, p.brand || null);
      });
    }

    const now = deps.now ?? Date.now;
    const visitorKey = deps.visitorKey;
    const visitorOf = (req: FastifyRequest): string | null =>
      visitorKey
        ? createHmac('sha256', visitorKey)
            .update(`${dayOf(now())}|${req.ip}|${req.headers['user-agent'] ?? ''}`)
            .digest('base64url')
            .slice(0, 16)
        : null;
    const toSearchInput = (p: z.infer<typeof searchQuery>, req: FastifyRequest) => ({
      query: p.q,
      country: p.country,
      state: p.state && isKnownState(p.country, p.state) ? p.state : null,
      sort: p.sort,
      includeAccessories: p.accesorios,
      includeRefurbished: p.reacondicionados,
      exact: p.exacto,
      visitor: visitorOf(req),
    });
    const unknownCountry = (code: string) => fail(400, 'pais-desconocido', `Todavía no hay tiendas para el país ${code}.`);

    api.get(
      '/search',
      { config: { rateLimit: { max: sec.searchesPerMinute, timeWindow: '1 minute' } } },
      async (req, reply) => {
        const p = searchQuery.parse(req.query);
        if (!isKnownCountry(p.country)) {
          const f = unknownCountry(p.country);
          return reply.status(f.statusCode).send(f.body);
        }
        reply.header('Cache-Control', 'private, max-age=60');
        return deps.service.search(toSearchInput(p, req));
      },
    );

    // La misma búsqueda en dos tandas por una sola conexión, una línea JSON por tanda: primero lo de las tiendas
    // rápidas (si faltan lentas, con partial: true) y al final la respuesta completa. Así la web enseña precios a los
    // pocos segundos aunque las tiendas que se leen con navegador tarden más. Si sale de caché, es una sola línea.
    api.get(
      '/search/stream',
      { config: { rateLimit: { max: sec.searchesPerMinute, timeWindow: '1 minute' } } },
      async (req, reply) => {
        const p = searchQuery.parse(req.query);
        if (!isKnownCountry(p.country)) {
          const f = unknownCountry(p.country);
          return reply.status(f.statusCode).send(f.body);
        }
        // Los errores de la petición se contestan antes de empezar a transmitir, con su código HTTP.
        if (tokenize(p.q).length === 0) throw new EmptyQueryError('Escribe qué producto buscas.');
        const out = new PassThrough();
        const line = (body: unknown) => `${JSON.stringify(body)}\n`;
        deps.service
          .search(toSearchInput(p, req), { onPartial: (early) => out.write(line(early)) })
          .then((full) => out.end(line(full)))
          .catch((err: unknown) => {
            app.log.error(err);
            out.end(line({ error: 'error-interno', message: 'Algo falló en el servidor.' } satisfies ApiError));
          });
        reply.header('Content-Type', 'application/x-ndjson; charset=utf-8');
        reply.header('Cache-Control', 'no-store');
        // Que ningún intermediario junte las dos líneas: la primera tiene que salir en cuanto existe.
        reply.header('X-Accel-Buffering', 'no');
        return reply.send(out);
      },
    );

    if (deps.history) {
      const history = deps.history;
      api.get('/history', async (req, reply): Promise<PriceHistoryResponse> => {
        const p = historyQuery.parse(req.query);
        reply.header('Cache-Control', 'private, max-age=300');
        return history.priceHistory(p.country, p.items, p.from ?? null, p.to ?? null);
      });
      api.get('/history/coverage', async (req, reply): Promise<HistoryCoverage> => {
        const p = countryQuery.parse(req.query);
        reply.header('Cache-Control', 'public, max-age=300');
        return history.coverage(p.country);
      });
    }

    if (deps.job && deps.jobKey) {
      const job = deps.job;
      const key = deps.jobKey;
      // Lo dispara Cloud Scheduler con la clave compartida. Sin clave correcta, 404: que no se note que existe.
      api.post('/jobs/refresh-prices', { config: { rateLimit: false } }, async (req, reply): Promise<RefreshJobResult> => {
        const given = req.headers['x-job-key'];
        if (typeof given !== 'string' || given.length !== key.length || !timingSafeEqual(Buffer.from(given), Buffer.from(key))) {
          return reply.status(404).send({ error: 'no-encontrado', message: 'No existe esa ruta.' } satisfies ApiError);
        }
        const { country: c } = countryQuery.parse(req.query);
        return job.run(c);
      });
    }

    // Reporte privado de uso. Sin la llave correcta, 404: que no se note que existe. Límite propio y sin caché.
    api.get('/stats', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply): Promise<StatsResponse | ApiError> => {
      if (!deps.stats || !deps.statsKey || !sameKey(req.headers['x-stats-key'], deps.statsKey)) {
        return reply.status(404).send({ error: 'no-encontrado', message: 'No existe esa ruta.' } satisfies ApiError);
      }
      const p = statsQuery.parse(req.query);
      reply.header('Cache-Control', 'no-store');
      return deps.stats.report(p.country, p.days);
    });

    api.get('/deals', async (req, reply) => {
      const p = countryQuery.parse(req.query);
      reply.header('Cache-Control', 'public, max-age=300');
      return deps.service.deals(p.country);
    });
  };

  // Las mismas rutas en la raíz (la app de celular ya las usa así) y bajo /api (la web).
  await app.register(routes);
  await app.register(routes, { prefix: '/api' });

  const notFound = { error: 'no-encontrado', message: 'No existe esa ruta.' } satisfies ApiError;

  if (sec.webDist) {
    const indexHtml = readFileSync(join(sec.webDist, 'index.html'), 'utf8');
    await app.register(fastifyStatic, {
      root: sec.webDist,
      wildcard: false,
      index: false,
      setHeaders: (reply, path) => {
        // Vite pone un hash en el nombre de cada archivo de assets/: se pueden guardar para siempre.
        reply.header('Cache-Control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'public, max-age=3600');
      },
    });
    app.setNotFoundHandler((req, reply) => {
      const wantsPage =
        req.method === 'GET' && !req.url.startsWith('/api/') && (req.headers.accept ?? '').includes('text/html');
      if (wantsPage) return reply.type('text/html; charset=utf-8').header('Cache-Control', 'no-cache').send(indexHtml);
      return reply.status(404).send(notFound);
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.status(404).send(notFound));
  }

  return app;
}
