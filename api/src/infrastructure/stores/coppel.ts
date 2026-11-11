import type { StoreInfo } from '../../../../shared/contracts.ts';
import type { SearchContext, StoreAdapter } from '../../application/ports.ts';
import type { RawOffer } from '../../domain/offer.ts';
import type { BrowserLane } from '../browser/browserLane.ts';
import { parseJson } from '../http/httpClient.ts';

const ORIGIN = 'https://www.coppel.com';

/**
 * Coppel: su página de resultados (/sd/<búsqueda>) es pública, pero los productos los pide la propia página con
 * una credencial que Coppel le da a su sitio; no la copiamos. Se abre la página en el carril de navegador y se lee
 * la respuesta GET_SEARCH_RESULTS que ella misma recibe (comprobado 8-nov-2026).
 */

interface CoppelProduct {
  name: string;
  brand?: string | null;
  partNumber?: string;
  sku?: string;
  href?: string;
  thumbnail?: string | null;
  price?: { discountedPrice?: number | null; salesPrice?: number | null; currency?: string } | null;
  mpSellerName?: string | null;
}
interface CoppelSearch {
  data?: { getSearchResults?: { products?: CoppelProduct[] | null } | null };
}

export function parseCoppelSearch(body: string): RawOffer[] {
  const data = parseJson<CoppelSearch>(body);
  const out: RawOffer[] = [];
  for (const p of data.data?.getSearchResults?.products ?? []) {
    const sales = p.price?.salesPrice ?? 0;
    const price = p.price?.discountedPrice || sales;
    if (!p.name || !p.href || !price || price <= 0) continue;
    out.push({
      externalId: p.sku || p.partNumber || p.href,
      title: p.name,
      brand: p.brand?.trim() || null,
      price,
      listPrice: sales > price ? sales : null,
      currency: p.price?.currency,
      url: ORIGIN + p.href,
      imageUrl: p.thumbnail || null,
      seller: p.mpSellerName && p.mpSellerName.toLowerCase() !== 'coppel' ? p.mpSellerName : null,
    });
  }
  return out;
}

export function createCoppelStore(lane: BrowserLane): StoreAdapter {
  const info: StoreInfo = {
    id: 'coppel',
    name: 'Coppel',
    country: 'MX',
    homepage: ORIGIN,
    access: 'pagina-web',
    availability: 'activa',
    note: 'Se lee abriendo su página de resultados en un navegador, como lo haría una persona.',
  };
  return {
    info,
    currency: 'MXN',
    // Abrir su página en un navegador tarda 10–15 s: tiene su propia espera y la primera tanda no la espera.
    slow: true,
    async search(query: string, ctx: SearchContext) {
      const body = await lane.capture(`${ORIGIN}/sd/${encodeURIComponent(query)}`, {
        signal: ctx.signal,
        timeoutMs: 20_000,
        match: /operationName=GET_SEARCH_RESULTS/,
        minBytes: 2_000,
      });
      return parseCoppelSearch(body);
    },
  };
}
