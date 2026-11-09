import type { Offer, ProductGroup, SortMode } from '../../../shared/contracts.ts';

/** Filtros que se aplican en el navegador sobre lo que ya contestó el servidor (no vuelven a consultar). */
export interface Filters {
  /** Tiendas elegidas; vacío = todas. */
  stores: string[];
  min: number | null;
  max: number | null;
  onlyDiscount: boolean;
  onlyMultiStore: boolean;
}

export const EMPTY_FILTERS: Filters = { stores: [], min: null, max: null, onlyDiscount: false, onlyMultiStore: false };

/** Todo lo que define una pantalla de resultados. Vive en la URL para poder compartirla y volver atrás. */
export interface SearchState {
  q: string;
  sort: SortMode;
  includeAccessories: boolean;
  includeRefurbished: boolean;
  /** Solo el producto exacto: sin variantes que el usuario no escribió (Pro, Ultra, Plus…). Lo decide el servidor. */
  exact: boolean;
  filters: Filters;
}

export const DEFAULT_SORT: SortMode = 'relevancia';
const SORTS: readonly SortMode[] = ['relevancia', 'precio', 'descuento'];
const STORE_ID = /^[a-z0-9-]{1,40}$/;
const MAX_QUERY = 120;

function parseMoney(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw.replace(/[,$\s]/g, ''));
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? Math.round(n) : null;
}

function parseFlag(raw: string | null): boolean {
  return raw === '1' || raw === 'true';
}

export function readSearchState(sp: URLSearchParams): SearchState {
  const q = (sp.get('q') ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY);
  const sortRaw = sp.get('orden');
  const sort = SORTS.find((s) => s === sortRaw) ?? DEFAULT_SORT;
  const stores = (sp.get('tiendas') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => STORE_ID.test(s))
    .slice(0, 40);
  let min = parseMoney(sp.get('min'));
  let max = parseMoney(sp.get('max'));
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  return {
    q,
    sort,
    includeAccessories: parseFlag(sp.get('acc')),
    includeRefurbished: parseFlag(sp.get('reac')),
    exact: parseFlag(sp.get('exacto')),
    filters: { stores: [...new Set(stores)], min, max, onlyDiscount: parseFlag(sp.get('desc')), onlyMultiStore: parseFlag(sp.get('varias')) },
  };
}

/** Solo escribe lo que no es el valor por omisión: la URL queda corta y legible. */
export function writeSearchState(s: SearchState): URLSearchParams {
  const sp = new URLSearchParams();
  sp.set('q', s.q);
  if (s.sort !== DEFAULT_SORT) sp.set('orden', s.sort);
  if (s.includeAccessories) sp.set('acc', '1');
  if (s.includeRefurbished) sp.set('reac', '1');
  if (s.exact) sp.set('exacto', '1');
  const f = s.filters;
  if (f.stores.length > 0) sp.set('tiendas', f.stores.join(','));
  if (f.min !== null) sp.set('min', String(f.min));
  if (f.max !== null) sp.set('max', String(f.max));
  if (f.onlyDiscount) sp.set('desc', '1');
  if (f.onlyMultiStore) sp.set('varias', '1');
  return sp;
}

export function activeFilterCount(f: Filters): number {
  return (f.stores.length > 0 ? 1 : 0) + (f.min !== null || f.max !== null ? 1 : 0) + (f.onlyDiscount ? 1 : 0) + (f.onlyMultiStore ? 1 : 0);
}

/** Vuelve a calcular lo mejor/peor de un grupo cuando se le quitan tiendas. */
function rebuild(group: ProductGroup, offers: Offer[]): ProductGroup {
  const sorted = [...offers].sort((a, b) => a.price - b.price);
  const best = sorted[0]!;
  const maxPrice = sorted[sorted.length - 1]!.price;
  const recommendation = group.recommendation && sorted.some((o) => o.id === group.recommendation!.offerId) ? group.recommendation : null;
  return {
    ...group,
    best,
    offers: sorted,
    storeCount: new Set(sorted.map((o) => o.storeId)).size,
    minPrice: best.price,
    maxPrice,
    spread: Math.round((maxPrice - best.price) * 100) / 100,
    recommendation,
  };
}

/**
 * Aplica los filtros a los grupos que mandó el servidor. Quitar tiendas recalcula el mejor precio del grupo;
 * el rango de precio se compara contra el precio más bajo; "solo con descuento" pide que alguna tienda lo tenga.
 * El orden del servidor se respeta (ya viene por relevancia, precio o descuento).
 */
export function applyFilters(groups: ProductGroup[], f: Filters): ProductGroup[] {
  const chosen = f.stores.length > 0 ? new Set(f.stores) : null;
  const out: ProductGroup[] = [];
  for (const group of groups) {
    const offers = chosen ? group.offers.filter((o) => chosen.has(o.storeId)) : group.offers;
    if (offers.length === 0) continue;
    const g = offers.length === group.offers.length ? group : rebuild(group, offers);
    if (f.min !== null && g.minPrice < f.min) continue;
    if (f.max !== null && g.minPrice > f.max) continue;
    if (f.onlyDiscount && !g.offers.some((o) => o.discountPct !== null)) continue;
    if (f.onlyMultiStore && g.storeCount < 2) continue;
    out.push(g);
  }
  return out;
}

export interface StoreCount {
  id: string;
  name: string;
  count: number;
}

/** Cuántos productos tiene cada tienda en estos resultados, de más a menos. */
export function storeCounts(groups: ProductGroup[]): StoreCount[] {
  const map = new Map<string, StoreCount>();
  for (const g of groups) {
    const seen = new Set<string>();
    for (const o of g.offers) {
      if (seen.has(o.storeId)) continue;
      seen.add(o.storeId);
      const cur = map.get(o.storeId);
      if (cur) cur.count += 1;
      else map.set(o.storeId, { id: o.storeId, name: o.storeName, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function priceBounds(groups: ProductGroup[]): { min: number; max: number } | null {
  if (groups.length === 0) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  for (const g of groups) {
    if (g.minPrice < min) min = g.minPrice;
    if (g.minPrice > max) max = g.minPrice;
  }
  return { min: Math.floor(min), max: Math.ceil(max) };
}
