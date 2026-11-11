import type { PricePoint, StoreInfo } from '../../../shared/contracts.ts';
import type { RawOffer } from '../domain/offer.ts';
import type { LearnedTerm } from '../domain/suggest.ts';

/** Lo que se guarda de una búsqueda que alguna tienda sí contestó. */
export interface SearchRecord {
  query: string;
  country: string;
  resultCount: number;
  /** Tiendas que respondieron con resultados. */
  storeCount: number;
}

/** Un precio visto en una tienda; es la base del historial de precios. */
export interface PriceRecord {
  country: string;
  storeId: string;
  externalId: string;
  title: string;
  brand: string | null;
  price: number;
  listPrice: number | null;
  currency: string;
  url: string;
  /** 'tienda' = lo leyó el servidor (por omisión); 'usuario' = lo vio una persona en la app al abrir la página. */
  source?: PriceSource;
}

export type PriceSource = 'tienda' | 'usuario';

/** Un precio guardado, con cuándo se vio: lo que se enseña cuando la tienda no contesta hoy. */
export interface RememberedOffer extends Omit<PriceRecord, 'country' | 'storeId'> {
  seenAt: string;
}

/** Un producto de una tienda, tal como lo identifica el historial. */
export interface ItemRef {
  storeId: string;
  externalId: string;
}

/** Serie de precios de un producto en una tienda: un punto por día (el mínimo de ese día). */
export interface PriceSeries extends ItemRef {
  title: string;
  url: string;
  currency: string;
  points: PricePoint[];
}

export interface CoverageInfo {
  /** Primer y último día con precios guardados (AAAA-MM-DD, hora de México), o null si no hay. */
  since: string | null;
  until: string | null;
  snapshots: number;
  items: number;
}

/**
 * Puerto de salida: la memoria del servidor (qué busca la gente, qué precios se vieron).
 * En producción es Postgres (Cloud SQL); sin base de datos, memoria del proceso. Nunca detiene una búsqueda.
 */
export interface SearchHistory {
  recordSearch(record: SearchRecord): Promise<void>;
  recordPrices(rows: PriceRecord[]): Promise<void>;
  /** Búsquedas de otras personas que empiezan con `prefix` (o alguna de sus palabras), las más repetidas primero. */
  learnedTerms(country: string, prefix: string, limit: number): Promise<LearnedTerm[]>;
  /** Historial diario de estos productos entre dos fechas (AAAA-MM-DD; `toExclusive` no se incluye). */
  priceSeries(country: string, items: ItemRef[], from: string, toExclusive: string): Promise<PriceSeries[]>;
  /**
   * Últimos precios vistos en una tienda cuyos títulos traen todas estas palabras, de los últimos `maxAgeDays` días,
   * el más reciente por producto. Es el respaldo cuando la tienda no contesta ahora.
   */
  lastOffers(country: string, storeId: string, words: string[], maxAgeDays: number, limit: number): Promise<RememberedOffer[]>;
  /** Cuántos precios hay guardados y de qué fechas. */
  coverage(country: string): Promise<CoverageInfo>;
  /** Las búsquedas más repetidas, para refrescar sus precios aunque nadie busque. */
  topTerms(country: string, limit: number): Promise<string[]>;
  close(): Promise<void>;
}

export interface SearchContext {
  /** Máximo de productos a pedirle a la tienda. */
  limit: number;
  signal: AbortSignal;
  /** Estado del usuario (clave), si lo eligió. Hoy ninguna tienda lo usa; queda en el contrato para cuando haya precios por zona. */
  state: string | null;
}

/** Puerto de salida: una tienda que se puede consultar. Cada tienda es un adaptador que cumple esto. */
export interface StoreAdapter {
  readonly info: StoreInfo;
  readonly currency: string;
  /**
   * Tarda bastante más que las demás (se lee con un navegador real). Tiene su propia espera máxima, más larga, y la
   * búsqueda en dos tandas no la espera para enseñar la primera.
   */
  readonly slow?: boolean;
  search(query: string, ctx: SearchContext): Promise<RawOffer[]>;
  /** Ofertas con mayor descuento del momento, si la tienda permite pedirlas ordenadas así. */
  deals?(ctx: SearchContext): Promise<RawOffer[]>;
}

/**
 * Puerto de salida: una tienda que NO se puede consultar pero sí enlazar. Siempre sabe armar su buscador con el
 * nombre del producto; si además reconoce el producto en su catálogo, da la página exacta.
 */
export interface StoreLinker {
  readonly storeId: string;
  readonly storeName: string;
  readonly country: string;
  /** Su buscador con el nombre del producto. Puro: no sale a la red y nunca falla. */
  searchUrl(title: string): string;
  /** La página de ESE producto en la tienda, o null si no lo reconoce. Puede salir a la red y respetar `signal`. */
  productUrl(title: string, brand: string | null, signal: AbortSignal): Promise<string | null>;
}

/** La tienda respondió, pero con un muro anti-robots, un captcha o una página que no es la que pedimos. */
export class StoreBlockedError extends Error {
  override readonly name = 'StoreBlockedError';
}

/** Falta configurar llaves de la API oficial. */
export class StoreCredentialsError extends Error {
  override readonly name = 'StoreCredentialsError';
}

export interface Cache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttlMs: number): void;
}

export interface Clock {
  now(): number;
}
