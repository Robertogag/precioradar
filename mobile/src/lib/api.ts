import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type {
  ApiError,
  CountryInfo,
  DealsResponse,
  HistoryCoverage,
  ObservationsResponse,
  ObservedPrice,
  PriceHistoryResponse,
  SearchResponse,
  SortMode,
  StoreInfo,
  StoreLinksResponse,
  SuggestResponse,
} from '../../../shared/contracts';
import { useSettings } from './settings';

const API_PORT = 4000;

/**
 * Dónde está el servidor. En desarrollo se deduce solo: es la misma computadora que sirve la app
 * (la que corre `expo start`), así que el teléfono no necesita configuración. En Ajustes se puede escribir otra.
 */
export function resolveServerUrl(override: string): string {
  if (override) return override;
  const fromEnv = process.env.EXPO_PUBLIC_API_URL;
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `http://${window.location.hostname}:${API_PORT}`;
  }
  const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
  return `http://${devHost ?? 'localhost'}:${API_PORT}`;
}

/** El servidor contestó con un error entendible, o no contestó. `serverUrl` va incluido para poder decirle al usuario a dónde se intentó. */
export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly serverUrl: string,
    readonly unreachable: boolean,
  ) {
    super(message);
  }
}

async function get<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const base = resolveServerUrl(useSettings.getState().serverUrl);
  const qs = Object.entries(params)
    .filter((e): e is [string, string] => e[1] !== undefined && e[1] !== '')
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  let res: Response;
  try {
    res = await fetch(`${base}${path}${qs ? `?${qs}` : ''}`, { headers: { Accept: 'application/json' } });
  } catch {
    throw new ApiFailure('No se pudo conectar con el servidor.', base, true);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiFailure(body?.message ?? `El servidor respondió ${res.status}.`, base, false);
  }
  return (await res.json()) as T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const base = resolveServerUrl(useSettings.getState().serverUrl);
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new ApiFailure('No se pudo conectar con el servidor.', base, true);
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiFailure(data?.message ?? `El servidor respondió ${res.status}.`, base, false);
  }
  return (await res.json()) as T;
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

export const api = {
  countries: () => get<CountryInfo[]>('/countries'),
  stores: (country: string) => get<StoreInfo[]>('/stores', { country }),
  deals: (country: string) => get<DealsResponse>('/deals', { country }),
  suggest: (q: string, country: string) => get<SuggestResponse>('/suggest', { q, country, limit: '8' }),
  search: (p: SearchParams) =>
    get<SearchResponse>('/search', {
      q: p.query,
      country: p.country,
      state: p.state ?? undefined,
      sort: p.sort,
      accesorios: p.includeAccessories ? '1' : '0',
      reacondicionados: p.includeRefurbished ? '1' : '0',
      exacto: p.exact ? '1' : '0',
    }),
  /** Historial diario de varios productos (ids "tienda:idExterno") entre dos fechas AAAA-MM-DD; sin fechas, los últimos 90 días. */
  history: (items: string[], country: string, from: string | null, to: string | null) =>
    get<PriceHistoryResponse>('/history', { items: items.join(','), country, from: from ?? undefined, to: to ?? undefined }),
  coverage: (country: string) => get<HistoryCoverage>('/history/coverage', { country }),
  /** La página exacta del producto en las tiendas que no se consultan (o su buscador si no lo reconocen). */
  links: (title: string, brand: string | null, country: string) =>
    get<StoreLinksResponse>('/links', { title, brand: brand ?? undefined, country }),
  /** Precios que la persona vio al abrir una tienda asistida (Mercado Libre) dentro de la app. */
  observe: (country: string, items: ObservedPrice[]) => post<ObservationsResponse>('/observations', { country, items }),
};
