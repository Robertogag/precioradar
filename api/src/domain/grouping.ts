import type { Offer, ProductGroup, Recommendation, SortMode } from '../../../shared/contracts.ts';
import { splitExtras } from './bundle.ts';
import { DESCRIPTOR_WORDS, MODEL_QUALIFIERS, coreTokens, isNumericToken, isShortModelCode, normalize, tokenize } from './text.ts';

/** El mismo producto no cuesta más del doble en otra tienda; si pasa, casi seguro no es el mismo producto. */
const MAX_PRICE_RATIO = 2;
/** Al menos la mitad de las palabras de los dos títulos deben ser las mismas. */
const MIN_TITLE_SIMILARITY = 0.5;
/** Para meter una oferta con MENOS especificaciones en un grupo con más, se exige un parecido mayor. */
const MIN_SUBSET_SIMILARITY = 0.6;
/** Con una sola especificación ("Xbox Series X 2TB") la firma afirma poco: se exige el mismo parecido mayor. */
const MIN_SINGLE_SPEC_SIMILARITY = 0.6;
/** Un paquete que cuesta hasta este tanto más que la oferta más barata, e incluye algo extra, se recomienda. */
const VALUE_PREMIUM = 0.12;

/** Título del producto sin sus extras: con eso se compara entre tiendas. */
const baseOf = (offer: Pick<Offer, 'title'>): string => splitExtras(offer.title).base;

/**
 * Firma de un producto cuando no hay código de barras: marca + condición + especificaciones
 * (todo lo que lleve número y los calificadores de modelo). Colores y adjetivos de mercadotecnia no cuentan.
 * Devuelve null si no hay suficiente para afirmar que dos títulos son lo mismo: preferimos no agrupar a agrupar mal.
 */
export function signature(offer: Offer, queryTokens: string[], knownBrands: Set<string>): string | null {
  // Las palabras buscadas NO entran en la firma: todas las ofertas ya coinciden con la búsqueda, y una tienda
  // que omite la palabra genérica ("Samsung 55 Crystal" sin "pantalla") sigue siendo el mismo producto.
  void queryTokens;
  const parts = signatureParts(offer, knownBrands);
  if (!parts || parts.strength < 2) return null;
  return `${parts.brand}|${offer.condition}|${[...parts.specs].sort().join(' ')}`;
}

/**
 * La marca como palabra clave: su primera palabra. Las tiendas la escriben distinto ("Nintendo", "NINTENDO SWITCH",
 * "Samsung Electronics") y es el mismo fabricante. Las marcas vacías ("General", "Genérico") no cuentan.
 */
export function brandKey(brand: string): string | null {
  const first = normalize(brand).split(' ')[0] ?? '';
  return first.length >= 2 && first !== 'general' && first !== 'generico' ? first : null;
}

export interface SignatureParts {
  brand: string;
  /** Números con su unidad, calificadores de modelo y claves cortas ("s24", "a16"). */
  specs: Set<string>;
  /** Cuántas de esas especificaciones son números o claves: con menos de 2 no se afirma nada por firma. */
  strength: number;
}

/** Las piezas de la firma, incluso cuando son pocas: sirven para juntar "Consola Nintendo Switch 2" con la de 256 GB. */
export function signatureParts(offer: Offer, knownBrands: Set<string>): SignatureParts | null {
  const base = baseOf(offer);
  const tokens = tokenize(base);
  const brand = offer.brand ? brandKey(offer.brand) : (tokens.find((t) => knownBrands.has(t)) ?? null);
  if (!brand) return null;

  const specs = new Set<string>();
  for (const t of tokens) {
    // "5G" o "Wi-Fi" describen, no identifican: no entran en la firma aunque lleven número.
    if (DESCRIPTOR_WORDS.has(t)) continue;
    // Una letra suelta distingue modelos ("Series X" no es "Series S"); también cuenta.
    if (isNumericToken(t) || MODEL_QUALIFIERS.has(t) || /^[a-z]$/.test(t)) specs.add(t);
  }
  // Claves cortas de modelo ("s24", "a16", "16e"): la letra distingue hermanos que comparten el número. Con letra
  // delante y un solo dígito ("sw2", "m4") no cuenta: el número ya está en las especificaciones y la letra suele ser
  // abreviatura de la tienda.
  let codes = 0;
  for (const w of normalize(base).split(' ')) {
    if (isShortModelCode(w) && !specs.has(w)) {
      specs.add(w);
      codes++;
    }
  }
  const numeric = [...specs].filter(isNumericToken).length;
  return { brand, specs, strength: numeric + codes };
}

const isStrictSubset = (a: Set<string>, b: Set<string>): boolean => a.size > 0 && a.size < b.size && [...a].every((x) => b.has(x));

/**
 * Claves de modelo del fabricante que aparecen en el título ("UN55U8500HFXZX", "55Q651G", "WH-CH530").
 * Es la señal más fuerte después del código de barras: dos tiendas con la misma clave venden lo mismo.
 * Se descarta lo que es número + unidad ("128gb", "5000mah").
 */
export function modelCodes(title: string): string[] {
  return normalize(title.replace(/(\w)-(\w)/g, '$1$2'))
    .split(' ')
    .filter((t) => t.length >= 6 && /[a-z]/.test(t) && /\d/.test(t) && !/^\d+(\.\d+)?[a-z]+$/.test(t));
}

/** Parecido entre dos títulos (0–1): palabras en común entre palabras totales, sin contar colores ni relleno. */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(coreTokens(a));
  const tb = new Set(coreTokens(b));
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  const total = ta.size + tb.size - common;
  return total === 0 ? 0 : common / total;
}

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    const p = this.parent.get(x);
    if (p === undefined) {
      this.parent.set(x, x);
      return x;
    }
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Qué conviene más dentro del grupo. La más barata manda; pero si otra cuesta poco más e incluye algo extra
 * (un juego, AppleCare, un accesorio), esa es la de mejor valor y se dice con números.
 */
export function recommend(offers: Offer[]): Recommendation | null {
  const best = offers[0];
  if (!best) return null;
  if (best.extras.length > 0) return { offerId: best.id, kind: 'mas-barato', extraCost: 0, extras: best.extras };
  const bundle = offers.find((o) => o.id !== best.id && o.extras.length > 0 && o.price <= best.price * (1 + VALUE_PREMIUM));
  if (bundle) return { offerId: bundle.id, kind: 'mejor-valor', extraCost: round2(bundle.price - best.price), extras: bundle.extras };
  return offers.length > 1 ? { offerId: best.id, kind: 'mas-barato', extraCost: 0, extras: [] } : null;
}

/**
 * Junta en un grupo las ofertas que son el mismo producto: mismo código de barras, misma clave de modelo,
 * o misma firma con título parecido y precio creíble. Un paquete ("+ juego") se junta con el producto base.
 * Dentro del grupo deja, por tienda, la más barata del producto solo y la más barata con extras.
 */
export function groupOffers(offers: Offer[], queryTokens: string[]): ProductGroup[] {
  const knownBrands = new Set(offers.flatMap((o) => (o.brand ? (brandKey(o.brand) ?? []) : [])));

  const uf = new UnionFind();
  interface Bucket {
    kind: string;
    brand: string;
    condition: string;
    specs: Set<string>;
    strength: number;
    offers: Offer[];
  }
  const bySpecs = new Map<string, Bucket>();
  for (const offer of offers) {
    const node = `o:${offer.id}`;
    uf.find(node);
    // Un accesorio nunca se junta con el producto, aunque su título traiga la clave del aparato para el que sirve.
    const kind = offer.isAccessory ? 'accesorio' : 'producto';
    // Evidencia fuerte: mismo código de barras o misma clave de modelo del fabricante.
    if (offer.gtin) uf.union(node, `g:${kind}:${offer.gtin}`);
    for (const code of modelCodes(baseOf(offer))) uf.union(node, `m:${kind}:${offer.condition}:${code}`);
    const parts = signatureParts(offer, knownBrands);
    if (parts) {
      const key = `${kind}|${parts.brand}|${offer.condition}|${[...parts.specs].sort().join(' ')}`;
      const bucket = bySpecs.get(key);
      if (bucket) bucket.offers.push(offer);
      else bySpecs.set(key, { kind, brand: parts.brand, condition: offer.condition, specs: parts.specs, strength: parts.strength, offers: [offer] });
    }
  }

  const credible = (a: Offer, b: Offer) => a.price <= b.price * MAX_PRICE_RATIO && b.price <= a.price * MAX_PRICE_RATIO;

  // Evidencia débil: misma marca y mismos números. Sola no basta (una microSD "para Switch 2 256GB" coincide
  // con la consola), así que además se exige que el título se parezca y que el precio sea creíble.
  // Cada oferta se junta con TODAS las anteriores que se le parecen, no solo con la primera: así un título largo en la
  // tienda más barata no parte el grupo en dos (las demás se parecen entre sí y la cadena las une).
  for (const bucket of bySpecs.values()) {
    if (bucket.strength < 1) continue;
    const minSimilarity = bucket.strength >= 2 ? MIN_TITLE_SIMILARITY : MIN_SINGLE_SPEC_SIMILARITY;
    const seen: Offer[] = [];
    for (const offer of [...bucket.offers].sort((a, b) => a.price - b.price)) {
      for (const other of seen) {
        if (credible(other, offer) && titleSimilarity(baseOf(other), baseOf(offer)) >= minSimilarity) uf.union(`o:${offer.id}`, `o:${other.id}`);
      }
      seen.push(offer);
    }
  }

  // Una oferta con MENOS especificaciones ("Consola Nintendo Switch 2", sin capacidad) se junta con el ÚNICO grupo
  // de la misma marca que tiene las suyas y más ("… 256GB"). Si hay varios candidatos (128 GB y 256 GB) no se adivina.
  // Solo para las que no pudieron agruparse por firma completa, y nunca hacia un modelo hermano ("15 Pro" no es un "15").
  const strong = [...bySpecs.values()].filter((b) => b.strength >= 2);
  for (const bucket of bySpecs.values()) {
    if (bucket.strength >= 2) continue;
    const supersets = strong.filter(
      (s) =>
        s.kind === bucket.kind &&
        s.brand === bucket.brand &&
        s.condition === bucket.condition &&
        isStrictSubset(bucket.specs, s.specs) &&
        [...s.specs].every((x) => bucket.specs.has(x) || !MODEL_QUALIFIERS.has(x)),
    );
    if (supersets.length === 0) continue;
    for (const offer of bucket.offers) {
      // De los grupos con más especificaciones, los que de verdad se parecen a esta oferta y tienen precio creíble.
      const matches = supersets.flatMap((s) => {
        const anchor = [...s.offers]
          .sort((a, b) => a.price - b.price)
          .find((a) => credible(a, offer) && titleSimilarity(baseOf(a), baseOf(offer)) >= MIN_SUBSET_SIMILARITY);
        return anchor ? [anchor] : [];
      });
      // Un solo candidato: se junta. Varios igual de parecidos (128 GB y 256 GB): no se adivina.
      if (matches.length === 1) uf.union(`o:${offer.id}`, `o:${matches[0]!.id}`);
    }
  }

  // Mismo título (sin colores ni relleno) de al menos cuatro palabras: es el mismo producto aunque no haya marca ni
  // números con qué firmarlo (dos publicaciones de la misma tienda, el mismo juego en dos tiendas).
  const byTitle = new Map<string, Offer[]>();
  for (const offer of offers) {
    const core = coreTokens(baseOf(offer));
    if (core.length < 4) continue;
    const key = `${offer.isAccessory ? 'accesorio' : 'producto'}|${offer.condition}|${core.join(' ')}`;
    const same = byTitle.get(key);
    if (same) same.push(offer);
    else byTitle.set(key, [offer]);
  }
  for (const same of byTitle.values()) {
    const anchors: Offer[] = [];
    for (const offer of [...same].sort((a, b) => a.price - b.price)) {
      const anchor = anchors.find((a) => credible(a, offer));
      if (anchor) uf.union(`o:${offer.id}`, `o:${anchor.id}`);
      else anchors.push(offer);
    }
  }

  const buckets = new Map<string, Offer[]>();
  for (const offer of offers) {
    const root = uf.find(`o:${offer.id}`);
    const list = buckets.get(root);
    if (list) list.push(offer);
    else buckets.set(root, [offer]);
  }

  const groups: ProductGroup[] = [];
  for (const [key, members] of buckets) {
    // Por tienda: la más barata del producto solo y, aparte, la más barata del paquete con extras.
    const cheapest = new Map<string, Offer>();
    for (const o of members) {
      const slot = `${o.storeId}|${o.extras.length > 0 ? 'paquete' : 'solo'}`;
      const cur = cheapest.get(slot);
      if (!cur || o.price < cur.price) cheapest.set(slot, o);
    }
    const rows = [...cheapest.values()].sort((a, b) => a.price - b.price);
    const best = rows[0]!;
    const maxPrice = rows[rows.length - 1]!.price;
    const plain = rows.find((o) => o.extras.length === 0) ?? best;
    // Título del grupo: el más "central" entre los productos solos (el que más se parece a los demás), no el que
    // puso la tienda más barata ("Nintendo Switch 2 - Versión Nacional" pierde contra "Consola Nintendo Switch 2").
    const plains = rows.filter((o) => o.extras.length === 0);
    const pool = plains.length > 0 ? plains : rows;
    const centrality = (o: Offer) => rows.reduce((sum, x) => (x === o ? sum : sum + titleSimilarity(baseOf(o), baseOf(x))), 0);
    const titled = pool.length > 2 ? [...pool].sort((a, b) => centrality(b) - centrality(a))[0]! : plain;
    groups.push({
      key,
      title: baseOf(titled),
      brand: best.brand ?? rows.find((o) => o.brand)?.brand ?? null,
      imageUrl: best.imageUrl ?? rows.find((o) => o.imageUrl)?.imageUrl ?? null,
      condition: best.condition,
      best,
      offers: rows,
      storeCount: new Set(rows.map((o) => o.storeId)).size,
      minPrice: best.price,
      maxPrice,
      spread: round2(maxPrice - best.price),
      recommendation: recommend(rows),
      links: [],
    });
  }
  return groups;
}

/**
 * Orden de los grupos. `focus` dice cuáles son "lo buscado" (la consola, no sus juegos ni controles): esos van
 * primero en cualquier orden; dentro de cada tramo manda el criterio elegido.
 */
export function sortGroups(groups: ProductGroup[], sort: SortMode, focus: ReadonlySet<ProductGroup> = new Set()): ProductGroup[] {
  const byPrice = (a: ProductGroup, b: ProductGroup) => a.minPrice - b.minPrice;
  const byFocus = (a: ProductGroup, b: ProductGroup) => Number(focus.has(b)) - Number(focus.has(a));
  const sorted = [...groups];
  if (sort === 'precio') return sorted.sort((a, b) => byFocus(a, b) || byPrice(a, b));
  if (sort === 'descuento') {
    return sorted.sort((a, b) => byFocus(a, b) || (b.best.discountPct ?? 0) - (a.best.discountPct ?? 0) || byPrice(a, b));
  }
  // relevancia: lo buscado, luego lo que más coincide, luego lo que se compara en más tiendas, luego lo más barato
  return sorted.sort((a, b) => byFocus(a, b) || b.best.relevance - a.best.relevance || b.storeCount - a.storeCount || byPrice(a, b));
}
