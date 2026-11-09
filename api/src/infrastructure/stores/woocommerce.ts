import type { StoreInfo } from '../../../../shared/contracts.ts';
import type { SearchContext, StoreAdapter } from '../../application/ports.ts';
import type { RawOffer } from '../../domain/offer.ts';
import { type HttpGet, parseJson } from '../http/httpClient.ts';

/**
 * Tiendas montadas en WooCommerce (WordPress): su Store API (/wp-json/wc/store/v1) es pública y devuelve precio,
 * precio regular, foto, existencia y liga. Los precios vienen en centavos con `currency_minor_unit`.
 * Un solo adaptador sirve a todas (Game Planet, comprobado 8-nov-2026).
 */

interface WcPrices {
  price?: string;
  regular_price?: string;
  sale_price?: string;
  currency_minor_unit?: number;
  currency_code?: string;
}
interface WcProduct {
  id: number;
  name: string;
  permalink: string;
  sku?: string;
  is_in_stock?: boolean;
  images?: { src: string }[];
  prices?: WcPrices;
}

const toMoney = (minor: string | undefined, unit: number): number => (minor ? Number(minor) / 10 ** unit : 0);

export function parseWooProducts(body: string): RawOffer[] {
  const products = parseJson<WcProduct[]>(body);
  if (!Array.isArray(products)) return [];
  const out: RawOffer[] = [];
  for (const p of products) {
    const unit = p.prices?.currency_minor_unit ?? 2;
    const price = toMoney(p.prices?.price, unit);
    if (!p.name || !p.permalink || price <= 0 || p.is_in_stock === false) continue;
    const regular = toMoney(p.prices?.regular_price, unit);
    out.push({
      externalId: String(p.id),
      title: p.name,
      price,
      listPrice: regular > price ? regular : null,
      currency: p.prices?.currency_code,
      url: p.permalink,
      imageUrl: p.images?.[0]?.src ?? null,
    });
  }
  return out;
}

export interface WooStoreConfig {
  id: string;
  name: string;
  host: string;
}

export function createWooCommerceStore(config: WooStoreConfig, http: HttpGet): StoreAdapter {
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
      const url = `${origin}/wp-json/wc/store/v1/products?search=${encodeURIComponent(query)}&per_page=${Math.min(ctx.limit, 24)}`;
      const res = await http(url, { accept: 'json', signal: ctx.signal });
      return parseWooProducts(res.body);
    },
  };
}
