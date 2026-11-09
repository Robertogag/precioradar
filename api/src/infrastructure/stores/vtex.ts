import type { StoreInfo } from '../../../../shared/contracts.ts';
import type { SearchContext, StoreAdapter } from '../../application/ports.ts';
import type { RawOffer } from '../../domain/offer.ts';
import { type HttpGet, parseJson } from '../http/httpClient.ts';

/**
 * Tiendas montadas en VTEX: exponen un catálogo público (/api/catalog_system/pub) que devuelve JSON
 * con precio, precio de lista, existencia y código de barras. Un solo adaptador sirve a todas;
 * agregar otra tienda VTEX es agregar un renglón en el registro.
 */

interface VtexOffer {
  Price: number;
  ListPrice: number;
  AvailableQuantity: number;
}
interface VtexItem {
  itemId: string;
  ean?: string;
  images?: { imageUrl: string }[];
  sellers?: { sellerName?: string; commertialOffer?: VtexOffer }[];
}
interface VtexProduct {
  productId: string;
  productName: string;
  brand?: string;
  link: string;
  items?: VtexItem[];
}

export function parseVtexProducts(body: string, storeName: string): RawOffer[] {
  const products = parseJson<VtexProduct[]>(body);
  if (!Array.isArray(products)) return [];
  const out: RawOffer[] = [];
  for (const p of products) {
    // De todas las variantes y vendedores con existencia, la más barata.
    let best: { item: VtexItem; offer: VtexOffer; seller: string | undefined } | null = null;
    for (const item of p.items ?? []) {
      for (const s of item.sellers ?? []) {
        const o = s.commertialOffer;
        if (!o || o.Price <= 0 || o.AvailableQuantity <= 0) continue;
        if (!best || o.Price < best.offer.Price) best = { item, offer: o, seller: s.sellerName };
      }
    }
    if (!best) continue;
    out.push({
      externalId: p.productId,
      title: p.productName,
      brand: p.brand ?? null,
      price: best.offer.Price,
      listPrice: best.offer.ListPrice,
      url: p.link,
      imageUrl: best.item.images?.[0]?.imageUrl ?? null,
      seller: best.seller && best.seller.toLowerCase() !== storeName.toLowerCase() ? best.seller : null,
      gtin: best.item.ean ?? null,
    });
  }
  return out;
}

export interface VtexStoreConfig {
  id: string;
  name: string;
  host: string;
}

export function createVtexStore(config: VtexStoreConfig, http: HttpGet): StoreAdapter {
  const info: StoreInfo = {
    id: config.id,
    name: config.name,
    country: 'MX',
    homepage: `https://${config.host}`,
    access: 'catalogo-publico',
    availability: 'activa',
    note: null,
  };
  const base = `https://${config.host}/api/catalog_system/pub/products/search`;

  async function run(params: string, ctx: SearchContext): Promise<RawOffer[]> {
    const to = Math.min(ctx.limit, 50) - 1;
    const res = await http(`${base}?${params}&_from=0&_to=${to}`, { accept: 'json', signal: ctx.signal });
    return parseVtexProducts(res.body, config.name);
  }

  return {
    info,
    currency: 'MXN',
    search: (query, ctx) => run(`ft=${encodeURIComponent(query)}`, ctx),
    deals: (ctx) => run('O=OrderByBestDiscountDESC', ctx),
  };
}
