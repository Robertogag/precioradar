import type { Condition, Offer } from '../../../shared/contracts.ts';
import { splitExtras } from './bundle.ts';
import { MODEL_QUALIFIERS, isNumericToken, normalize, normalizeGtin, stem, tokenize } from './text.ts';

/** Lo que entrega un adaptador de tienda, antes de que el dominio lo califique. */
export interface RawOffer {
  /** Identificador del producto dentro de la tienda (SKU, ASIN…). */
  externalId: string;
  title: string;
  brand?: string | null;
  price: number;
  listPrice?: number | null;
  currency?: string;
  url: string;
  imageUrl?: string | null;
  rating?: number | null;
  reviews?: number | null;
  seller?: string | null;
  gtin?: string | null;
  /** Solo si la tienda lo declara; si no, se deduce del título. */
  condition?: Condition;
  /** Cuándo se vio este precio, solo cuando es un precio guardado porque la tienda no contestó ahora. */
  seenAt?: string | null;
  seenBy?: 'tienda' | 'usuario' | null;
}

export interface StoreRef {
  id: string;
  name: string;
  currency: string;
}

/** Palabras que casi siempre son un accesorio, estén donde estén en el título. */
const STRONG_ACCESSORY = new Set([
  'funda', 'mica', 'protector', 'carcasa', 'case', 'estuche', 'correa', 'cubierta', 'skin', 'sticker', 'calcomania',
  'repuesto', 'refaccion', 'templado', 'bumper', 'accesorio', 'accessory', 'accessori',
]);

/** Palabras que solo indican accesorio si van ANTES de lo buscado ("Cargador para iPhone 15", no "iPhone 15 con cargador"). */
const WEAK_ACCESSORY = new Set([
  'cable', 'cargador', 'adaptador', 'soporte', 'base', 'control', 'bateria', 'lente', 'holder', 'dock', 'kit',
  'compatible', 'pantalla', 'display', 'tapa', 'teclado', 'mouse', 'audifono', 'bocina', 'memoria', 'stylus', 'lapiz',
  'camara', 'diadema', 'headset', 'auricular', 'microfono', 'volante', 'joystick', 'gamepad', 'mando', 'grip',
  'tarjeta', 'microsd', 'bolsa', 'maleta', 'mochila', 'tripie', 'tripode', 'pila', 'filtro', 'cartucho', 'toner',
  'tinta', 'vidrio', 'cristal', 'lamina', 'parlante', 'cubre', 'cover', 'mount', 'strap',
  // Software para el aparato: tampoco es el aparato.
  'videojuego', 'juego', 'game', 'dlc', 'controller', 'joy',
]);

/**
 * Si el título TERMINA en una de estas palabras tras lo buscado ("Nintendo Switch 2 Cámara"), es el accesorio, no el
 * aparato. Solo las que al final nombran un objeto aparte; "pantalla", "memoria" o "batería" al final describen al aparato.
 */
const TRAILING_ACCESSORY = new Set([
  'camara', 'diadema', 'headset', 'auricular', 'audifono', 'microfono', 'cargador', 'cable', 'adaptador', 'control',
  'controller', 'joystick', 'gamepad', 'mando', 'volante', 'estuche', 'funda', 'mica', 'soporte', 'base', 'dock',
  'teclado', 'mouse', 'stylus', 'lapiz', 'tripie', 'tripode', 'bolsa', 'mochila', 'maleta', 'cover', 'strap', 'grip',
]);
const INCLUDES_WORDS = new Set(['con', 'incluye', 'y', 'mas', 'e', 'and', 'with', 'plus']);

/**
 * Palabras que trae casi todo lo encontrado ("camara" al buscar "canon r50"): nombran la categoría del producto,
 * no un accesorio, y por eso no cuentan como tal. Con pocos resultados no se afirma nada.
 */
export function commonTokens(offers: Pick<RawOffer, 'title'>[], share = 0.4): Set<string> {
  if (offers.length < 5) return new Set();
  const counts = new Map<string, number>();
  for (const o of offers) for (const t of new Set(tokenize(o.title))) counts.set(t, (counts.get(t) ?? 0) + 1);
  return new Set([...counts].filter(([, n]) => n / offers.length >= share).map(([t]) => t));
}

// "reacondicio" y no "reacondicionad": las tiendas lo escriben mal ("Reacondicioando") y sigue siendo reacondicionado.
const REFURBISHED = ['reacondicio', 'renewed', 'refurbished', 'seminuev', 'remanufacturad', 'open box', 'caja abierta'];
/** Abreviaturas que solo cuentan como palabra completa ("Rfb", "usado"), para no confundir "usador" o similares. */
const REFURBISHED_WORDS = /\b(rfb|refurb|usado|usada|reacond)\b/;

export function detectCondition(title: string): Condition {
  const t = title.toLowerCase();
  return REFURBISHED.some((w) => t.includes(w)) || REFURBISHED_WORDS.test(t) ? 'reacondicionado' : 'nuevo';
}

/**
 * ¿El título habla de un accesorio del producto buscado y no del producto?
 * Nunca marca accesorio si el usuario buscó justo eso ("funda iphone 15").
 */
export function detectAccessory(titleTokens: string[], queryTokens: string[], title?: string, category: ReadonlySet<string> = new Set()): boolean {
  const asked = new Set(queryTokens);
  const firstHit = titleTokens.findIndex((t) => asked.has(t) && !isNumericToken(t));

  // "Tarjeta microSD para Nintendo Switch 2": si lo buscado aparece por primera vez DESPUÉS de un "para",
  // el título habla de algo para ese producto, no del producto.
  if (title) {
    const words = normalize(title).split(' ');
    const para = words.findIndex((w) => w === 'para' || w === 'for');
    const hit = words.findIndex((w) => !isNumericToken(w) && asked.has(stem(w)));
    if (para !== -1 && hit !== -1 && para < hit) return true;
    // "Nintendo Switch 2 Cámara": termina en el accesorio y no viene "con/incluye" antes (eso sería el aparato con regalo).
    const last = stem(words[words.length - 1] ?? '');
    const before = words[words.length - 2] ?? '';
    if (words.length >= 3 && hit !== -1 && hit < words.length - 1 && TRAILING_ACCESSORY.has(last) && !asked.has(last) && !category.has(last) && !INCLUDES_WORDS.has(before)) {
      return true;
    }
  }

  for (let i = 0; i < titleTokens.length; i++) {
    const tok = titleTokens[i]!;
    if (asked.has(tok) || category.has(tok)) continue;
    if (STRONG_ACCESSORY.has(tok)) return true;
    if (WEAK_ACCESSORY.has(tok) && firstHit !== -1 && i < firstHit) return true;
  }
  return false;
}

/**
 * Qué tanto coincide un título con la búsqueda (0–1), o 0 si no debe salir.
 * Los números mandan: "iphone 15" no acepta un "iPhone 16". De las palabras basta la mitad,
 * porque las tiendas nombran distinto ("Pantalla Samsung 55" vs "Samsung TV 55").
 */
export function scoreRelevance(titleTokens: string[], queryTokens: string[], required: ReadonlySet<string> = new Set()): number {
  if (queryTokens.length === 0) return 0;
  const title = new Set(titleTokens);
  const numeric = queryTokens.filter(isNumericToken);
  const words = queryTokens.filter((t) => !isNumericToken(t));

  const hasNumeric = (q: string) => title.has(q) || titleTokens.some((t) => isNumericToken(t) && t.startsWith(q) && /^[a-z]/.test(t.slice(q.length)));
  if (!numeric.every(hasNumeric)) return 0;

  const hasWord = (q: string) => title.has(q) || (q.length >= 4 && titleTokens.some((t) => t.startsWith(q) || (t.length >= 4 && q.startsWith(t))));
  // Si el usuario escribió una marca, es obligatoria: "pantalla samsung 55" no acepta una TCL.
  if (!words.filter((w) => required.has(w)).every(hasWord)) return 0;
  const matchedWords = words.filter(hasWord).length;
  const needed = words.length === 0 ? 0 : Math.max(1, Math.ceil(words.length / 2));
  if (matchedWords < needed) return 0;

  return (matchedWords + numeric.length) / queryTokens.length;
}

export function discountPct(price: number, listPrice: number | null): number | null {
  if (!listPrice || listPrice <= price) return null;
  const pct = Math.round(((listPrice - price) / listPrice) * 100);
  return pct >= 1 ? pct : null;
}

/** Convierte lo que trajo la tienda en una oferta calificada. Devuelve null si el dato no sirve (sin precio, sin liga). */
export function toOffer(
  raw: RawOffer,
  store: StoreRef,
  queryTokens: string[],
  required: ReadonlySet<string> = new Set(),
  category: ReadonlySet<string> = new Set(),
): Offer | null {
  if (!raw.title || !raw.url || !Number.isFinite(raw.price) || raw.price <= 0) return null;
  const titleTokens = tokenize(raw.title);
  // La marca cuenta aunque la tienda no la repita en el título ("Smart TV 55 Crystal UHD", marca Samsung).
  const scoringTokens = raw.brand ? [...titleTokens, ...tokenize(raw.brand)] : titleTokens;
  const listPrice = raw.listPrice && raw.listPrice > raw.price ? raw.listPrice : null;
  return {
    id: `${store.id}:${raw.externalId}`,
    storeId: store.id,
    storeName: store.name,
    title: raw.title.replace(/\s+/g, ' ').trim(),
    brand: raw.brand?.trim() || null,
    price: Math.round(raw.price * 100) / 100,
    listPrice,
    discountPct: discountPct(raw.price, listPrice),
    currency: raw.currency ?? store.currency,
    url: raw.url,
    imageUrl: raw.imageUrl || null,
    rating: raw.rating && raw.rating > 0 ? Math.round(raw.rating * 10) / 10 : null,
    reviews: raw.reviews && raw.reviews > 0 ? raw.reviews : null,
    seller: raw.seller?.trim() || null,
    gtin: normalizeGtin(raw.gtin),
    condition: raw.condition ?? detectCondition(raw.title),
    isAccessory: queryTokens.length > 0 ? detectAccessory(titleTokens, queryTokens, raw.title, category) : false,
    relevance: queryTokens.length > 0 ? scoreRelevance(scoringTokens, queryTokens, required) : 1,
    extras: splitExtras(raw.title).extras,
    seenAt: raw.seenAt ?? null,
    seenBy: raw.seenAt ? (raw.seenBy ?? 'tienda') : null,
  };
}

/**
 * Modo exacto: todas las palabras de la búsqueda están y el producto base no trae un calificador de modelo
 * que el usuario no pidió ("Galaxy S25" no acepta "S25 Ultra"; "iPhone 15" no acepta "15 Pro").
 * Los extras del paquete no cuentan: "+ Apple Watch Ultra" no convierte al iPhone en un Ultra.
 */
export function isExactMatch(offer: Pick<Offer, 'title' | 'brand' | 'relevance'>, queryTokens: string[]): boolean {
  if (offer.relevance < 1) return false;
  const asked = new Set(queryTokens);
  const tokens = tokenize(splitExtras(offer.title).base);
  return !tokens.some((t) => MODEL_QUALIFIERS.has(t) && !asked.has(t));
}

/**
 * Palabras de la búsqueda que son marcas, según las marcas que las propias tiendas declararon en esta respuesta.
 * No hay lista fija de marcas que mantener: se aprende de los datos de cada búsqueda.
 */
export function brandsInQuery(raws: RawOffer[], queryTokens: string[]): Set<string> {
  const brands = new Set<string>();
  for (const r of raws) {
    if (r.brand) for (const t of tokenize(r.brand)) brands.add(t);
  }
  return new Set(queryTokens.filter((t) => !isNumericToken(t) && t.length >= 2 && brands.has(t)));
}
