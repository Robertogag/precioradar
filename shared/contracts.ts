/**
 * Contrato entre el servidor (api/) y las apps (mobile/, web/).
 * Solo tipos: todos lo importan con `import type`, así que no agrega código en tiempo de ejecución
 * y un cambio aquí rompe la compilación del lado que se quedó atrás.
 */

/** Cómo se obtiene la información de la tienda. */
export type StoreAccess = 'api-oficial' | 'catalogo-publico' | 'pagina-web';

/** Si la tienda se puede consultar hoy. */
export type StoreAvailability = 'activa' | 'requiere-credenciales' | 'bloqueada';

export interface StateInfo {
  code: string;
  name: string;
}

export interface CountryInfo {
  code: string;
  name: string;
  currency: string;
  locale: string;
  states: StateInfo[];
  /** Cuántas tiendas de este país se consultan hoy. */
  activeStores: number;
}

export interface StoreInfo {
  id: string;
  name: string;
  country: string;
  homepage: string;
  access: StoreAccess;
  availability: StoreAvailability;
  /** Explicación en lenguaje llano de por qué no está activa, o qué limita. */
  note: string | null;
}

export type Condition = 'nuevo' | 'reacondicionado';

/** Un precio de un producto en una tienda. */
export interface Offer {
  id: string;
  storeId: string;
  storeName: string;
  title: string;
  brand: string | null;
  /** Precio que se paga hoy. */
  price: number;
  /** Precio "antes" que publica la tienda, solo si es mayor al actual. */
  listPrice: number | null;
  /** Porcentaje de descuento que resulta de listPrice → price (entero), o null si no hay precio anterior. */
  discountPct: number | null;
  currency: string;
  url: string;
  imageUrl: string | null;
  rating: number | null;
  reviews: number | null;
  /** Vendedor cuando la tienda es marketplace. */
  seller: string | null;
  /** Código de barras (EAN/UPC) cuando la tienda lo publica; sirve para empatar el mismo producto entre tiendas. */
  gtin: string | null;
  condition: Condition;
  /** Funda, mica, cable… algo que acompaña al producto buscado pero no lo es. */
  isAccessory: boolean;
  /** 0–1: qué tanto coincide el título con lo buscado. */
  relevance: number;
  /** Lo que el paquete incluye además del producto ("EA Sports FC 27", "AppleCare+ 2 años"). Vacío si es el producto solo. */
  extras: string[];
  /** Cuándo se vio este precio, SOLO si la tienda no contestó ahora y se enseña su último precio guardado. */
  seenAt?: string | null;
  /** Quién lo vio: el servidor ('tienda') o una persona en la app al abrir la página ('usuario'). */
  seenBy?: 'tienda' | 'usuario' | null;
}

/** Un precio que una persona vio en la app al abrir la página de una tienda (Mercado Libre). */
export interface ObservedPrice {
  url: string;
  title: string;
  price: number;
  listPrice?: number | null;
  currency?: string;
}
export interface ObservationsRequest {
  country: string;
  items: ObservedPrice[];
}
export interface ObservationsResponse {
  accepted: number;
  rejected: { url: string; reason: string }[];
}

export type RecommendationKind =
  /** La oferta más barata del grupo. */
  | 'mas-barato'
  /** Cuesta un poco más que la más barata, pero incluye algo extra que lo compensa. */
  | 'mejor-valor';

/** Qué conviene más dentro de un grupo, con los datos para explicarlo. */
export interface Recommendation {
  offerId: string;
  kind: RecommendationKind;
  /** Cuánto más cuesta que la oferta más barata del grupo (0 si es la misma). */
  extraCost: number;
  /** Lo que incluye de más la oferta recomendada. */
  extras: string[];
}

/** El mismo producto visto en una o varias tiendas. */
export interface ProductGroup {
  key: string;
  title: string;
  brand: string | null;
  imageUrl: string | null;
  condition: Condition;
  /** La oferta más barata del grupo. */
  best: Offer;
  /**
   * Ofertas de menor a mayor precio: por tienda, la más barata del producto solo y, si existe, la más barata
   * del producto con extras (para que el paquete con regalo no se esconda detrás del precio base).
   */
  offers: Offer[];
  storeCount: number;
  minPrice: number;
  maxPrice: number;
  /** Cuánto se ahorra comprando en la tienda más barata contra la más cara del grupo. */
  spread: number;
  recommendation: Recommendation | null;
  // (Las ofertas con `seenAt` son precios de antes: la tienda no contestó ahora.)
  /**
   * Tiendas que no entregan precios por vía automática pero sí se pueden abrir a mano (Mercado Libre). La búsqueda
   * trae de inmediato el enlace a su buscador; `/links` lo mejora a la página del producto cuando la tienda lo reconoce.
   */
  links: StoreLink[];
}

/** Enlace a una tienda que no se consulta: `producto` = su página de ese producto; `busqueda` = su buscador con el nombre. */
export interface StoreLink {
  storeId: string;
  storeName: string;
  url: string;
  kind: 'producto' | 'busqueda';
}

export interface StoreLinksResponse {
  country: string;
  title: string;
  links: StoreLink[];
}

export type StoreRunStatus =
  | 'ok'
  | 'sin-resultados'
  | 'bloqueada'
  | 'requiere-credenciales'
  | 'tiempo-agotado'
  | 'error'
  /** Solo en la primera tanda de una búsqueda: la tienda (lenta) todavía no contesta; llega en la respuesta completa. */
  | 'pendiente';

/** Qué pasó con cada tienda en esta búsqueda; la app lo enseña para que nunca parezca que "no hay" cuando en realidad falló. */
export interface StoreRun {
  storeId: string;
  storeName: string;
  status: StoreRunStatus;
  /** Ofertas que coincidieron con lo buscado. */
  count: number;
  ms: number;
  message: string | null;
  /**
   * Si la tienda no contestó ahora (captcha, caída, tardó) pero sí hace poco, se enseña su última respuesta buena y
   * aquí va de hace cuántos minutos es. null o ausente = precios de ahora.
   */
  ageMinutes?: number | null;
}

export type SortMode = 'relevancia' | 'precio' | 'descuento';

export interface SearchResponse {
  query: string;
  country: string;
  state: string | null;
  sort: SortMode;
  /** true = solo el producto exacto: todas las palabras presentes y sin variantes ajenas (Pro, Ultra, Plus…). */
  exact: boolean;
  groups: ProductGroup[];
  totalOffers: number;
  /** Accesorios que se ocultaron (la app ofrece mostrarlos). */
  hiddenAccessories: number;
  /** Reacondicionados que se ocultaron. */
  hiddenRefurbished: number;
  /** Variantes que el modo exacto dejó fuera. */
  hiddenInexact: number;
  stores: StoreRun[];
  cached: boolean;
  tookMs: number;
  generatedAt: string;
  /**
   * true = primera tanda: ya contestaron las tiendas rápidas y faltan las lentas (marcadas «pendiente»); la respuesta
   * completa llega después por la misma conexión. Ausente o false = respuesta completa.
   */
  partial?: boolean;
}

/** Un día de uso, en hora de México. */
export interface StatsDay {
  day: string;
  /** Búsquedas de personas (nuevas más repetidas que salieron de caché). */
  searches: number;
  /** De esas, cuántas salieron de caché (alguien buscó lo mismo hace poco). */
  fromCache: number;
  /** Personas distintas ese día (código que cambia cada día; no se guarda la IP). */
  visitors: number;
  /** Búsquedas del refresco automático de las 6:00; no son personas. */
  refresh: number;
}

export interface StatsQuery {
  query: string;
  searches: number;
  /** Productos encontrados en promedio. */
  avgResults: number;
  lastAt: string;
}

export interface StatsStore {
  storeId: string;
  storeName: string;
  /** Veces que se le preguntó (búsquedas nuevas, de personas y del refresco). */
  runs: number;
  ok: number;
  /** Contestó pero no tenía el producto. */
  empty: number;
  /** Bloqueó, tardó demasiado o falló. */
  failed: number;
  avgMs: number;
}

/** Reporte privado de uso (ruta con llave). */
export interface StatsResponse {
  country: string;
  from: string;
  to: string;
  totals: { searches: number; fromCache: number; visits: number; refresh: number };
  daily: StatsDay[];
  topQueries: StatsQuery[];
  /** Lo que la gente buscó y no encontró en ninguna tienda. */
  noResults: StatsQuery[];
  stores: StatsStore[];
  generatedAt: string;
}

export interface DealsResponse {
  country: string;
  offers: Offer[];
  stores: StoreRun[];
  cached: boolean;
  generatedAt: string;
}

/** Un precio visto un día (el mínimo de ese día). */
export interface PricePoint {
  /** Día, AAAA-MM-DD, en la hora de México. */
  date: string;
  price: number;
  listPrice: number | null;
}

/** El historial de un producto en una tienda. */
export interface PriceHistoryItem {
  storeId: string;
  storeName: string | null;
  externalId: string;
  title: string;
  currency: string;
  url: string;
  points: PricePoint[];
  min: number;
  max: number;
  first: number;
  last: number;
  firstSeen: string;
  lastSeen: string;
}

export interface PriceHistoryResponse {
  country: string;
  /** Periodo devuelto (AAAA-MM-DD, inclusive). */
  from: string;
  to: string;
  /** Desde qué día hay precios guardados en este servidor; null si no hay ninguno. */
  since: string | null;
  items: PriceHistoryItem[];
}

/** Cuántos datos de historial hay y de qué fechas. */
export interface HistoryCoverage {
  country: string;
  since: string | null;
  until: string | null;
  snapshots: number;
  items: number;
}

export interface RefreshJobResult {
  country: string;
  terms: number;
  searches: number;
  offers: number;
  tookMs: number;
}

export interface ApiError {
  error: string;
  message: string;
}

/** De dónde sale una sugerencia al escribir. */
export type SuggestionKind =
  /** Un modelo conocido por nombre ("iPhone 15 Pro"). */
  | 'modelo'
  /** Una configuración del modelo que ya coincide ("iPhone 15 Pro 256GB"). */
  | 'variante'
  /** Algo que otras personas ya buscaron en este servidor y sí trajo resultados. */
  | 'popular'
  /** Una búsqueda anterior de este mismo usuario (la app la agrega; el servidor no la conoce). */
  | 'reciente';

export interface Suggestion {
  /** Texto listo para buscar. */
  text: string;
  kind: SuggestionKind;
  brand: string | null;
  /** Categoría del catálogo de modelos (celular, pantalla, consola…), o null si no viene de ahí. */
  category: string | null;
}

export interface SuggestResponse {
  query: string;
  suggestions: Suggestion[];
  /**
   * Modelos "hermanos" y variantes de lo que el usuario ya escribió completo (iPhone 15 → 15 Plus, 15 Pro…;
   * 128GB / 256GB…). Sirven para saltar a comparar un modelo exacto.
   */
  related: Suggestion[];
}
