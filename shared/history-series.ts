import type { Offer, PriceHistoryItem } from './contracts.ts';

/**
 * Qué series del historial se enseñan. La misma regla en la web y en la app:
 * - de entrada, solo el producto SOLO (sin paquetes) en las tiendas más baratas, hasta `DEFAULT_VISIBLE`;
 * - nunca más de `MAX_VISIBLE` a la vez: la paleta tiene 8 colores y un color no se repite;
 * - cada serie conserva su color mientras esté a la vista (el color sigue a la tienda, no a su posición).
 */
export const DEFAULT_VISIBLE = 6;
export const MAX_VISIBLE = 8;

export interface HistorySeries {
  item: PriceHistoryItem;
  key: string;
  storeName: string;
  /** Es el producto con extras (paquete), no el producto solo. */
  bundle: boolean;
  extras: string[];
}

/** Series ordenadas por su último precio, la más barata primero; a igual precio, el producto solo antes que el paquete. */
export function orderSeries(items: PriceHistoryItem[], offers: Pick<Offer, 'id' | 'storeName' | 'extras'>[]): HistorySeries[] {
  return items
    .map((item) => {
      const offer = offers.find((o) => o.id === `${item.storeId}:${item.externalId}`);
      const extras = offer?.extras ?? [];
      return { item, key: `${item.storeId}:${item.externalId}`, storeName: item.storeName ?? offer?.storeName ?? item.storeId, bundle: extras.length > 0, extras };
    })
    .sort((a, b) => a.item.last - b.item.last || Number(a.bundle) - Number(b.bundle) || a.storeName.localeCompare(b.storeName));
}

export const eligibleSeries = (series: HistorySeries[], includeBundles: boolean): HistorySeries[] =>
  includeBundles ? series : series.filter((s) => !s.bundle);

export interface SeriesSelection {
  /** Claves a la vista, en el orden de `orderSeries`. */
  shown: string[];
  /** Color (1–8) de cada clave a la vista. */
  slots: Record<string, number>;
}

/** De entrada: las primeras `DEFAULT_VISIBLE` elegibles, con los colores 1, 2, 3… */
export function defaultSelection(series: HistorySeries[], includeBundles: boolean): SeriesSelection {
  const shown = eligibleSeries(series, includeBundles)
    .slice(0, DEFAULT_VISIBLE)
    .map((s) => s.key);
  return { shown, slots: Object.fromEntries(shown.map((k, i) => [k, i + 1])) };
}

/** Oculta o muestra una serie. Al mostrar toma el color libre más bajo; si ya hay `MAX_VISIBLE` a la vista, sale la más cara. */
export function toggleSeries(sel: SeriesSelection, series: HistorySeries[], key: string): SeriesSelection {
  const order = new Map(series.map((s, i) => [s.key, i]));
  const slots = { ...sel.slots };
  if (sel.shown.includes(key)) {
    delete slots[key];
    return { shown: sel.shown.filter((k) => k !== key), slots };
  }
  let shown = [...sel.shown];
  if (shown.length >= MAX_VISIBLE) {
    const priciest = [...shown].sort((a, b) => (order.get(b) ?? 0) - (order.get(a) ?? 0))[0]!;
    shown = shown.filter((k) => k !== priciest);
    delete slots[priciest];
  }
  const used = new Set(Object.values(slots));
  let slot = 1;
  while (used.has(slot)) slot++;
  slots[key] = slot;
  shown.push(key);
  shown.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  return { shown, slots };
}
