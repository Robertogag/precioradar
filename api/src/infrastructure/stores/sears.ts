import type { StoreInfo } from '../../../../shared/contracts.ts';
import type { SearchContext, StoreAdapter } from '../../application/ports.ts';
import type { RawOffer } from '../../domain/offer.ts';
import type { BrowserLane } from '../browser/browserLane.ts';
import { parseJson } from '../http/httpClient.ts';

const ORIGIN = 'https://www.sears.com.mx';

/**
 * Sears: su página de resultados (/resultados?query=) es pública y los productos los pide la propia página a su
 * buscador. Se abre la página en el carril de navegador y se lee esa respuesta (comprobado 8-nov-2026).
 */

interface SearsHit {
  objectID: string;
  title: string;
  sku?: string;
  ean?: string | null;
  brand?: string | null;
  price?: number | null;
  sale_price?: number | null;
  stock?: number | null;
  is_active?: boolean;
  photos?: (string | { source?: string; thumbnail?: string; url?: string; src?: string })[] | null;
  sellers?: { name?: string }[] | null;
}
interface SearsSearch {
  results?: { index?: string; hits?: SearsHit[] }[];
}

/** Liga del producto: Sears la arma con su id y el nombre en minúsculas con guiones. */
export function searsProductUrl(objectId: string, title: string): string {
  const slug = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `${ORIGIN}/producto/${objectId}/${slug || 'producto'}`;
}

export function parseSearsSearch(body: string): RawOffer[] {
  const data = parseJson<SearsSearch>(body);
  const results = data.results ?? [];
  const main = results.find((r) => r.index === 'sears') ?? results.sort((a, b) => (b.hits?.length ?? 0) - (a.hits?.length ?? 0))[0];
  const out: RawOffer[] = [];
  for (const h of main?.hits ?? []) {
    const regular = h.price ?? 0;
    const price = h.sale_price && h.sale_price > 0 && h.sale_price < regular ? h.sale_price : regular;
    if (!h.title || !h.objectID || price <= 0 || h.is_active === false || (typeof h.stock === 'number' && h.stock <= 0)) continue;
    const photo = h.photos?.[0];
    const image = typeof photo === 'string' ? photo : (photo?.source ?? photo?.thumbnail ?? photo?.url ?? photo?.src ?? null);
    const seller = h.sellers?.[0]?.name;
    out.push({
      externalId: h.objectID,
      title: h.title,
      brand: h.brand?.trim() || null,
      price,
      listPrice: regular > price ? regular : null,
      url: searsProductUrl(h.objectID, h.title),
      imageUrl: image ? image.replace(/^\/\//, 'https://') : null,
      seller: seller && seller.toLowerCase() !== 'sears' ? seller : null,
      gtin: h.ean ?? null,
    });
  }
  return out;
}

export function createSearsStore(lane: BrowserLane): StoreAdapter {
  const info: StoreInfo = {
    id: 'sears',
    name: 'Sears',
    country: 'MX',
    homepage: ORIGIN,
    access: 'pagina-web',
    availability: 'activa',
    note: 'Se lee abriendo su página de resultados en un navegador, como lo haría una persona.',
  };
  return {
    info,
    currency: 'MXN',
    async search(query: string, ctx: SearchContext) {
      const body = await lane.capture(`${ORIGIN}/resultados?query=${encodeURIComponent(query)}`, {
        signal: ctx.signal,
        timeoutMs: 20_000,
        match: /algolia\.net\/1\/indexes\/\*\/queries/,
        minBytes: 5_000,
      });
      return parseSearsSearch(body);
    },
  };
}
