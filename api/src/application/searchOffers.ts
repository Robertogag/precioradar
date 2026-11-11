import type { DealsResponse, Offer, SearchResponse, SortMode, StoreRun, StoreRunStatus } from '../../../shared/contracts.ts';
import { focusGroups } from '../domain/focus.ts';
import { groupOffers, sortGroups } from '../domain/grouping.ts';
import { type RawOffer, brandsInQuery, commonTokens, isExactMatch, toOffer } from '../domain/offer.ts';
import { normalize, tokenize } from '../domain/text.ts';
import type { LinksService } from './links.ts';
import {
  type Cache,
  type Clock,
  type SearchContext,
  type SearchHistory,
  type SearchOrigin,
  type StoreAdapter,
  StoreBlockedError,
  StoreCredentialsError,
} from './ports.ts';

export interface SearchDeps {
  stores: StoreAdapter[];
  cache: Cache;
  clock: Clock;
  /** Espera máxima por tienda. Una tienda lenta no detiene a las demás. */
  storeTimeoutMs: number;
  /** Espera máxima de las tiendas marcadas `slow` (navegador real). Sin valor, la misma que las demás. */
  slowStoreTimeoutMs?: number;
  /**
   * Búsqueda en dos tandas: la primera sale cuando contestaron todas las tiendas que no son lentas, o a este tiempo
   * como máximo si alguna rápida se cuelga. Sin valor, 5 s.
   */
  partialAfterMs?: number;
  perStoreLimit: number;
  searchTtlMs: number;
  dealsTtlMs: number;
  /** Memoria de búsquedas y precios. Opcional: sin ella la búsqueda funciona igual, solo no aprende. */
  history?: SearchHistory;
  onHistoryError?: (err: unknown) => void;
  /** Enlaces a tiendas que no se consultan (su buscador, sin red). Opcional. */
  links?: Pick<LinksService, 'searchLinks'>;
  /**
   * Última respuesta buena de cada tienda por búsqueda. Si una tienda falla ahora (Amazon y su captcha intermitente),
   * se enseña lo que contestó hace poco, diciendo de hace cuánto. Opcional.
   */
  storeMemory?: Cache;
}

/** Cuánto vale la última respuesta buena de una tienda cuando hoy no contesta. */
const STORE_MEMORY_TTL_MS = 12 * 60 * 60_000;
/** Si tampoco hay memoria reciente, se buscan en el historial los precios de los últimos días (se enseñan con su fecha). */
const HISTORY_FALLBACK_DAYS = 7;

/** Palabras con las que se buscan precios guardados: las letras de la búsqueda y los dígitos de sus números. */
function memoryWords(queryTokens: string[]): string[] {
  const words = queryTokens.map((t) => (/^\d/.test(t) ? t.replace(/[^\d.]/g, '') : t)).filter((w) => w.length >= 2);
  return [...new Set(words)].slice(0, 4);
}

/** Cuántos precios de una búsqueda se guardan en el historial (los más relevantes ya vienen primero por tienda). */
const PRICES_PER_SEARCH = 200;
/** Segundo intento para una tienda que rechazó la consulta, solo si contestó rápido (no si se tardó o se agotó el tiempo). */
const RETRY_IF_FASTER_THAN_MS = 6_000;
const RETRY_DELAY_MS = 1_200;

export interface SearchInput {
  query: string;
  country: string;
  state: string | null;
  sort: SortMode;
  includeAccessories: boolean;
  includeRefurbished: boolean;
  /** Solo el producto exacto: todas las palabras y sin variantes ajenas (Pro, Ultra, Plus…). */
  exact?: boolean;
  /** Ignorar la caché y volver a consultar a las tiendas (lo usa el refresco programado). */
  fresh?: boolean;
  /** Quién busca: una persona (por omisión) o el refresco automático. Solo afecta lo que se anota en el reporte de uso. */
  origin?: SearchOrigin;
  /** Código del visitante del día (lo calcula la capa HTTP; nunca la IP). */
  visitor?: string | null;
}

export interface SearchOptions {
  /**
   * Primera tanda: se llama una vez con lo de las tiendas rápidas cuando todavía faltan lentas. No se llama si la
   * respuesta sale de caché o si no hay nada pendiente. Lo usa la ruta que transmite la búsqueda en dos líneas.
   */
  onPartial?: (early: SearchResponse) => void;
}

export class EmptyQueryError extends Error {
  override readonly name = 'EmptyQueryError';
}

interface Gathered {
  offers: Offer[];
  runs: StoreRun[];
  at: number;
}

const DEFAULT_PARTIAL_AFTER_MS = 5_000;

function classify(err: unknown): { status: StoreRunStatus; message: string } {
  if (err instanceof StoreBlockedError) return { status: 'bloqueada', message: err.message };
  if (err instanceof StoreCredentialsError) return { status: 'requiere-credenciales', message: err.message };
  if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return { status: 'tiempo-agotado', message: 'La tienda tardó demasiado en responder.' };
  }
  return { status: 'error', message: err instanceof Error ? err.message : 'Error desconocido' };
}

export function createSearchService(deps: SearchDeps) {
  /** Consulta todas las tiendas a la vez; cada una reporta qué le pasó. */
  async function gather(
    stores: StoreAdapter[],
    state: string | null,
    queryTokens: string[],
    memory: { key: string; country: string; words: string[] },
    call: (store: StoreAdapter, ctx: SearchContext) => Promise<RawOffer[]>,
    onEarly?: (early: Gathered) => void,
  ): Promise<Gathered> {
    type Fetched = { store: StoreAdapter; ms: number; ageMinutes: number | null } & ({ raw: RawOffer[] } | { failure: ReturnType<typeof classify> });
    type Pending = { store: StoreAdapter; ms: number; pending: true };
    type Remembered = { raw: RawOffer[]; at: number };
    const timeoutFor = (store: StoreAdapter) => (store.slow ? (deps.slowStoreTimeoutMs ?? deps.storeTimeoutMs) : deps.storeTimeoutMs);
    const attempt = (store: StoreAdapter) =>
      call(store, { limit: deps.perStoreLimit, signal: AbortSignal.timeout(timeoutFor(store)), state });
    const remember = (store: StoreAdapter, raw: RawOffer[]) => {
      if (deps.storeMemory && raw.length > 0) deps.storeMemory.set(`${memory.key}|${store.info.id}`, { raw, at: deps.clock.now() } satisfies Remembered, STORE_MEMORY_TTL_MS);
    };
    const minutesSince = (at: number) => Math.max(1, Math.round((deps.clock.now() - at) / 60_000));
    // Si la tienda falló ahora: primero su última respuesta buena (12 h), luego lo guardado en el historial (7 días).
    // En ambos casos cada precio lleva cuándo se vio, y la tienda, de hace cuánto es.
    const recall = async (store: StoreAdapter, failure: ReturnType<typeof classify>, ms: number): Promise<Fetched> => {
      const mem = deps.storeMemory?.get<Remembered>(`${memory.key}|${store.info.id}`);
      if (mem) {
        const seenAt = new Date(mem.at).toISOString();
        return { store, ms, raw: mem.raw.map((r) => ({ ...r, seenAt })), ageMinutes: minutesSince(mem.at) };
      }
      if (deps.history && memory.words.length > 0) {
        try {
          const rows = await deps.history.lastOffers(memory.country, store.info.id, memory.words, HISTORY_FALLBACK_DAYS, deps.perStoreLimit);
          if (rows.length > 0) {
            const newest = Math.max(...rows.map((r) => Date.parse(r.seenAt)));
            return { store, ms, raw: rows.map((r) => ({ ...r, brand: r.brand ?? undefined, seenBy: r.source ?? 'tienda' })), ageMinutes: minutesSince(newest) };
          }
        } catch (err) {
          deps.onHistoryError?.(err);
        }
      }
      return { store, ms, failure, ageMinutes: null };
    };
    const run = async (store: StoreAdapter): Promise<Fetched> => {
      const started = deps.clock.now();
      try {
        const raw = await attempt(store);
        remember(store, raw);
        return { store, ms: deps.clock.now() - started, raw, ageMinutes: null };
      } catch (first) {
        // Algunas tiendas (Amazon) rechazan una petición sí y otra no. Un segundo intento, y solo uno,
        // si la primera respuesta llegó rápido; nunca más que eso.
        const failure = classify(first);
        const quick = deps.clock.now() - started < RETRY_IF_FASTER_THAN_MS;
        if ((failure.status === 'bloqueada' || failure.status === 'error') && quick) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
          try {
            const raw = await attempt(store);
            remember(store, raw);
            return { store, ms: deps.clock.now() - started, raw, ageMinutes: null };
          } catch (second) {
            return recall(store, classify(second), deps.clock.now() - started);
          }
        }
        return recall(store, failure, deps.clock.now() - started);
      }
    };

    // Con lo que trajeron las tiendas se sabe qué palabras de la búsqueda son marcas (obligatorias) y qué palabra
    // nombra la categoría ("camara" al buscar una cámara: no es accesorio aunque la palabra lo parezca).
    const assemble = (list: (Fetched | Pending)[]): Gathered => {
      const everything = list.flatMap((f) => ('raw' in f ? f.raw : []));
      const required = brandsInQuery(everything, queryTokens);
      const category = commonTokens(everything);
      const offers: Offer[] = [];
      const runs: StoreRun[] = [];
      for (const f of list) {
        if ('pending' in f) {
          runs.push({ storeId: f.store.info.id, storeName: f.store.info.name, ms: f.ms, ageMinutes: null, status: 'pendiente', count: 0, message: null });
          continue;
        }
        const base = { storeId: f.store.info.id, storeName: f.store.info.name, ms: f.ms, ageMinutes: f.ageMinutes };
        if ('failure' in f) {
          runs.push({ ...base, ...f.failure, count: 0 });
          continue;
        }
        const ref = { id: f.store.info.id, name: f.store.info.name, currency: f.store.currency };
        const mine = f.raw.map((r) => toOffer(r, ref, queryTokens, required, category)).filter((o): o is Offer => o !== null && o.relevance > 0);
        offers.push(...mine);
        runs.push({ ...base, status: mine.length > 0 ? 'ok' : 'sin-resultados', count: mine.length, message: null });
      }
      return { offers, runs, at: deps.clock.now() };
    };

    const startedAll = deps.clock.now();
    const settled = new Map<StoreAdapter, Fetched>();
    const tasks = stores.map((store) =>
      run(store).then((f) => {
        settled.set(store, f);
        return f;
      }),
    );

    // Primera tanda: cuando contestaron todas las tiendas que no son lentas (o al tiempo máximo, si una rápida se
    // cuelga), se avisa con lo que hay y lo que falta queda «pendiente». Nunca detiene la búsqueda completa.
    if (onEarly && stores.some((s) => s.slow)) {
      const fast = tasks.filter((_, i) => !stores[i]!.slow);
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([Promise.all(fast), new Promise((r) => (timer = setTimeout(r, deps.partialAfterMs ?? DEFAULT_PARTIAL_AFTER_MS)))]);
      clearTimeout(timer);
      if (settled.size > 0 && settled.size < stores.length) {
        const now = deps.clock.now();
        try {
          onEarly(assemble(stores.map((s) => settled.get(s) ?? { store: s, ms: now - startedAll, pending: true })));
        } catch {
          // Si quien escucha ya se fue (cerró la conexión), la búsqueda completa sigue y se guarda igual.
        }
      }
    }
    return assemble(await Promise.all(tasks));
  }

  const answered = (g: Gathered) => g.runs.some((r) => r.status === 'ok' || r.status === 'sin-resultados');

  type Who = { origin: SearchOrigin; visitor: string | null };

  /** Una búsqueda repetida que salió de caché también es alguien buscando: se anota, sin precios ni tiendas. */
  function rememberRepeat(country: string, query: string, g: Gathered, who: Who): void {
    const history = deps.history;
    if (!history) return;
    const storeCount = g.runs.filter((r) => r.status === 'ok').length;
    history
      .recordSearch({ query, country, resultCount: g.offers.length, storeCount, ...who, fromCache: true })
      .catch((err: unknown) => deps.onHistoryError?.(err));
  }

  /** Guarda la búsqueda y los precios vistos sin hacer esperar al usuario; si la memoria falla, se avisa y ya. */
  function remember(country: string, query: string, g: Gathered, who: Who): void {
    const history = deps.history;
    if (!history) return;
    const rows = g.offers.slice(0, PRICES_PER_SEARCH).map((o) => ({
      country,
      storeId: o.storeId,
      externalId: o.id.slice(o.storeId.length + 1),
      title: o.title,
      brand: o.brand,
      price: o.price,
      listPrice: o.listPrice,
      currency: o.currency,
      url: o.url,
    }));
    const storeCount = g.runs.filter((r) => r.status === 'ok').length;
    void Promise.all([
      history.recordSearch({ query, country, resultCount: g.offers.length, storeCount, ...who, fromCache: false }),
      rows.length > 0 ? history.recordPrices(rows) : Promise.resolve(),
      history.recordStoreRuns(
        country,
        g.runs.map((r) => ({ storeId: r.storeId, status: r.status, ms: r.ms })),
      ),
    ]).catch((err: unknown) => deps.onHistoryError?.(err));
  }

  async function search(input: SearchInput, options: SearchOptions = {}): Promise<SearchResponse> {
    const started = deps.clock.now();
    const query = input.query.trim().replace(/\s+/g, ' ');
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) throw new EmptyQueryError('Escribe qué producto buscas.');
    const exact = input.exact === true;

    // La misma respuesta para la primera tanda y para la completa: filtros, grupos, orden y enlaces.
    const shape = (gathered: Gathered, cached: boolean, partial: boolean): SearchResponse => {
      const hiddenAccessories = input.includeAccessories ? 0 : gathered.offers.filter((o) => o.isAccessory).length;
      const visibleA = input.includeAccessories ? gathered.offers : gathered.offers.filter((o) => !o.isAccessory);
      const hiddenRefurbished = input.includeRefurbished ? 0 : visibleA.filter((o) => o.condition !== 'nuevo').length;
      const visibleB = input.includeRefurbished ? visibleA : visibleA.filter((o) => o.condition === 'nuevo');
      const visible = exact ? visibleB.filter((o) => isExactMatch(o, queryTokens)) : visibleB;
      const grouped = groupOffers(visible, queryTokens);
      // Lo buscado (la consola) antes que lo que es para lo buscado (juegos, controles), en cualquier orden.
      const groups = sortGroups(grouped, input.sort, focusGroups(grouped, queryTokens));
      if (deps.links) for (const g of groups) g.links = deps.links.searchLinks(input.country, g.title);
      return {
        query,
        country: input.country,
        state: input.state,
        sort: input.sort,
        exact,
        groups,
        totalOffers: visible.length,
        hiddenAccessories,
        hiddenRefurbished,
        hiddenInexact: visibleB.length - visible.length,
        stores: gathered.runs,
        cached,
        tookMs: deps.clock.now() - started,
        generatedAt: new Date(gathered.at).toISOString(),
        partial,
      };
    };

    const key = `search:${input.country}:${normalize(query)}`;
    const who: Who = { origin: input.origin ?? 'persona', visitor: input.visitor ?? null };
    const hit = input.fresh ? undefined : deps.cache.get<Gathered>(key);
    if (hit) {
      rememberRepeat(input.country, query, hit, who);
      return shape(hit, true, false);
    }

    const stores = deps.stores.filter((s) => s.info.country === input.country);
    const onPartial = options.onPartial;
    const gathered = await gather(
      stores,
      input.state,
      queryTokens,
      { key: `store:${input.country}:${normalize(query)}`, country: input.country, words: memoryWords(queryTokens) },
      (store, ctx) => store.search(query, ctx),
      onPartial ? (early) => onPartial(shape(early, false, true)) : undefined,
    );
    // Solo la respuesta completa se guarda. Si ninguna tienda contestó (sin internet, por ejemplo) tampoco:
    // el siguiente intento vuelve a consultar.
    if (answered(gathered)) {
      deps.cache.set(key, gathered, deps.searchTtlMs);
      remember(input.country, query, gathered, who);
    }
    return shape(gathered, false, false);
  }

  /** Lo más rebajado del momento en las tiendas que permiten pedir su catálogo ordenado por descuento. */
  async function deals(country: string): Promise<DealsResponse> {
    const key = `deals:${country}`;
    let gathered = deps.cache.get<Gathered>(key);
    const cached = gathered !== undefined;
    if (!gathered) {
      const stores = deps.stores.filter((s) => s.info.country === country && s.deals);
      gathered = await gather(stores, null, [], { key: `deals:${country}`, country, words: [] }, (store, ctx) => store.deals!(ctx));
      if (answered(gathered)) deps.cache.set(key, gathered, deps.dealsTtlMs);
    }
    // Un "descuento" de más de 90 % casi siempre es un precio de lista inflado o un error de captura de la tienda.
    const offers = gathered.offers
      .filter((o) => o.discountPct !== null && o.discountPct >= 10 && o.discountPct <= 90)
      .sort((a, b) => (b.discountPct ?? 0) - (a.discountPct ?? 0))
      .slice(0, 80);
    return { country, offers, stores: gathered.runs, cached, generatedAt: new Date(gathered.at).toISOString() };
  }

  return { search, deals };
}

export type SearchService = ReturnType<typeof createSearchService>;
