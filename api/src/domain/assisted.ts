/**
 * Tiendas "asistidas": no entregan precios al servidor, pero sí a una persona que abre su página. La app abre la
 * página dentro de ella y manda el precio que la tienda le mostró a esa persona; aquí se decide qué ligas valen y
 * cómo se identifica el producto dentro de la liga.
 */

export interface AssistedStore {
  id: string;
  name: string;
  /** Dominios de la tienda (sin subdominio o con él). */
  host: RegExp;
  /** Identificador del producto a partir de la liga, o null si la liga no es de un producto o un listado reconocible. */
  externalId(url: URL): string | null;
}

export const ASSISTED_STORES: AssistedStore[] = [
  {
    id: 'mercadolibre',
    name: 'Mercado Libre',
    host: /(^|\.)mercadolibre\.com\.mx$/i,
    // Página de producto de catálogo (/p/MLM48921521) o publicación (MLM-1234567890, /MLM1234567890).
    externalId: (url) => {
      const m = url.pathname.match(/MLM-?(\d{6,})/i);
      return m ? `MLM${m[1]}` : null;
    },
  },
];

export interface AssistedLink {
  store: AssistedStore;
  externalId: string;
  /** La liga sin parámetros de rastreo ni ancla. */
  cleanUrl: string;
}

/** ¿Esta liga es de una tienda asistida y apunta a un producto? */
export function assistedLink(raw: string, stores: AssistedStore[] = ASSISTED_STORES): AssistedLink | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  const store = stores.find((s) => s.host.test(url.hostname));
  if (!store) return null;
  const externalId = store.externalId(url);
  if (!externalId) return null;
  return { store, externalId, cleanUrl: `${url.origin}${url.pathname}` };
}
