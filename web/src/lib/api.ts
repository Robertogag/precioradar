import type {
  ApiError,
  CountryInfo,
  DealsResponse,
  HistoryCoverage,
  PriceHistoryResponse,
  SearchResponse,
  SortMode,
  StoreInfo,
  StoreLinksResponse,
  SuggestResponse,
} from '../../../shared/contracts.ts';
import { lineSplitter } from './ndjson.ts';

/**
 * Dónde está la API. Vacío = el mismo origen de la página (en desarrollo Vite lo pasa al servidor; en producción
 * el servidor sirve la web). Solo se cambia cuando la web se publica en otro dominio que la API.
 */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '');

/** El servidor contestó un error entendible, o no contestó (`status` null). */
export class ApiFailure extends Error {
  override readonly name = 'ApiFailure';
  constructor(
    message: string,
    readonly code: string | null,
    readonly status: number | null,
  ) {
    super(message);
  }
  get unreachable(): boolean {
    return this.status === null;
  }
}

type Params = Record<string, string | number | boolean | null | undefined>;

function urlFor(path: string, params: Params): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    qs.set(key, String(value));
  }
  const query = qs.toString();
  return `${BASE}/api${path}${query ? `?${query}` : ''}`;
}

const isAbort = (err: unknown) => err instanceof DOMException && err.name === 'AbortError';

async function request(path: string, params: Params, accept: string, signal?: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(urlFor(path, params), { headers: { Accept: accept }, credentials: 'omit', signal });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new ApiFailure('unreachable', null, null);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiFailure(body?.message ?? `HTTP ${res.status}`, body?.error ?? null, res.status);
  }
  return res;
}

async function get<T>(path: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
  const res = await request(path, params, 'application/json', signal);
  return (await res.json()) as T;
}

/**
 * Búsqueda en dos tandas por una sola conexión: si las tiendas lentas todavía no contestan, el servidor manda primero
 * una línea con lo que ya hay (`partial: true`), que se entrega a `onPartial`, y al final la respuesta completa, que es
 * lo que devuelve. Si la búsqueda está en caché llega una sola línea.
 */
async function searchStream(path: string, params: Params, onPartial: (early: SearchResponse) => void, signal?: AbortSignal): Promise<SearchResponse> {
  const res = await request(path, params, 'application/x-ndjson', signal);
  const got: { full: SearchResponse | null } = { full: null };
  const split = lineSplitter((value) => {
    const body = value as SearchResponse | ApiError;
    if ('error' in body) throw new ApiFailure(body.message, body.error, 500);
    if (body.partial) onPartial(body);
    else got.full = body;
  });
  try {
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        split.push(decoder.decode(value, { stream: true }));
      }
      split.push(decoder.decode());
    } else {
      split.push(await res.text());
    }
    split.end();
  } catch (err) {
    if (isAbort(err) || err instanceof ApiFailure) throw err;
    throw new ApiFailure('unreachable', null, null);
  }
  if (!got.full) throw new ApiFailure('unreachable', null, null);
  return got.full;
}

export interface SearchParams {
  query: string;
  country: string;
  state: string | null;
  sort: SortMode;
  includeAccessories: boolean;
  includeRefurbished: boolean;
  exact: boolean;
}

const searchParams = (p: SearchParams): Params => ({
  q: p.query,
  country: p.country,
  state: p.state,
  sort: p.sort,
  accesorios: p.includeAccessories ? 1 : 0,
  reacondicionados: p.includeRefurbished ? 1 : 0,
  exacto: p.exact ? 1 : 0,
});

/** Un producto de una tienda, como lo identifica el historial: el id de la oferta ya es "tienda:idExterno". */
export const historyItem = (offerId: string) => offerId;

export const api = {
  countries: (signal?: AbortSignal) => get<CountryInfo[]>('/countries', {}, signal),
  stores: (country: string, signal?: AbortSignal) => get<StoreInfo[]>('/stores', { country }, signal),
  deals: (country: string, signal?: AbortSignal) => get<DealsResponse>('/deals', { country }, signal),
  suggest: (q: string, country: string, signal?: AbortSignal) =>
    get<SuggestResponse>('/suggest', { q, country, limit: 8 }, signal),
  search: (p: SearchParams, signal?: AbortSignal) => get<SearchResponse>('/search', searchParams(p), signal),
  /** La misma búsqueda en dos tandas: `onPartial` recibe lo de las tiendas rápidas mientras las lentas terminan. */
  searchInTwoBatches: (p: SearchParams, onPartial: (early: SearchResponse) => void, signal?: AbortSignal) =>
    searchStream('/search/stream', searchParams(p), onPartial, signal),
  /** Historial diario de varios productos (ids "tienda:idExterno") entre dos fechas AAAA-MM-DD; sin fechas, los últimos 90 días. */
  history: (items: string[], country: string, from: string | null, to: string | null, signal?: AbortSignal) =>
    get<PriceHistoryResponse>('/history', { items: items.join(','), country, from, to }, signal),
  coverage: (country: string, signal?: AbortSignal) => get<HistoryCoverage>('/history/coverage', { country }, signal),
  /** La página exacta del producto en las tiendas que no se consultan (o su buscador si no lo reconocen). */
  links: (title: string, brand: string | null, country: string, signal?: AbortSignal) =>
    get<StoreLinksResponse>('/links', { title, brand, country }, signal),
};
