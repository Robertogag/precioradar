import type { StoreInfo } from '../../../../shared/contracts.ts';
import type { SearchContext, StoreAdapter } from '../../application/ports.ts';
import type { RawOffer } from '../../domain/offer.ts';
import { type HttpGet, parseJson } from '../http/httpClient.ts';

/**
 * Tiendas montadas en Shopify: su buscador de sugerencias (/search/suggest.json) es público y devuelve hasta 10
 * productos con precio, precio anterior, marca, foto y liga. Un solo adaptador sirve a todas (Doto, comprobado 8-nov-2026).
 */

interface ShopifyProduct {
  id: number;
  title: string;
  url: string;
  vendor?: string | null;
  available?: boolean;
  price?: string | number;
  price_min?: string | number;
  compare_at_price_min?: string | number | null;
  compare_at_price_max?: string | number | null;
  featured_image?: { url?: string } | null;
  image?: string | null;
}
interface ShopifySuggest {
  resources?: { results?: { products?: ShopifyProduct[] } };
}

const num = (v: string | number | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));

export function parseShopifySuggest(body: string, origin: string): RawOffer[] {
  const data = parseJson<ShopifySuggest>(body);
  const out: RawOffer[] = [];
  for (const p of data.resources?.results?.products ?? []) {
    const price = num(p.price_min ?? p.price);
    if (!p.title || !p.url || price <= 0 || p.available === false) continue;
    const compare = num(p.compare_at_price_min ?? p.compare_at_price_max);
    const image = p.featured_image?.url ?? p.image ?? null;
    out.push({
      externalId: String(p.id),
      title: p.title,
      brand: p.vendor?.trim() || null,
      price,
      listPrice: compare > price ? compare : null,
      // La liga trae parámetros de rastreo de la búsqueda (?_pos=…); fuera.
      url: origin + p.url.split('?')[0],
      imageUrl: image ? image.replace(/^\/\//, 'https://') : null,
    });
  }
  return out;
}

export interface ShopifyStoreConfig {
  id: string;
  name: string;
  host: string;
}

export function createShopifyStore(config: ShopifyStoreConfig, http: HttpGet): StoreAdapter {
  const origin = `https://${config.host}`;
  const info: StoreInfo = {
    id: config.id,
    name: config.name,
    country: 'MX',
    homepage: origin,
    access: 'catalogo-publico',
    availability: 'activa',
    note: null,
  };
  return {
    info,
    currency: 'MXN',
    async search(query: string, ctx: SearchContext) {
      // El buscador de sugerencias da 10 como máximo; es lo que hay sin usar la API privada de la tienda.
      const url = `${origin}/search/suggest.json?q=${encodeURIComponent(query)}&resources[type]=product&resources[limit]=10&resources[options][unavailable_products]=hide`;
      const res = await http(url, { accept: 'json', signal: ctx.signal });
      return parseShopifySuggest(res.body, origin);
    },
  };
}
