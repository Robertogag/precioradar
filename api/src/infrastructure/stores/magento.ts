import type { StoreInfo } from '../../../../shared/contracts.ts';
import type { SearchContext, StoreAdapter } from '../../application/ports.ts';
import type { RawOffer } from '../../domain/offer.ts';
import { type HttpGet, parseJson } from '../http/httpClient.ts';

/**
 * Tiendas montadas en Magento 2 / Adobe Commerce: su GraphQL público (/graphql) responde búsquedas con precio
 * regular, precio final, foto y existencia. Un solo adaptador sirve a todas (Steren, comprobado 8-nov-2026).
 */

interface MagentoPrice {
  regular_price?: { value?: number; currency?: string };
  final_price?: { value?: number };
}
interface MagentoItem {
  name: string;
  sku: string;
  url_key: string;
  price_range?: { minimum_price?: MagentoPrice };
  small_image?: { url?: string };
  stock_status?: string;
}
interface MagentoSearch {
  data?: { products?: { items?: MagentoItem[] } };
}

export function parseMagentoProducts(body: string, origin: string, urlSuffix = ''): RawOffer[] {
  const data = parseJson<MagentoSearch>(body);
  const out: RawOffer[] = [];
  for (const it of data.data?.products?.items ?? []) {
    const min = it.price_range?.minimum_price;
    const price = min?.final_price?.value ?? min?.regular_price?.value ?? 0;
    if (!it.name || !it.url_key || price <= 0 || (it.stock_status && it.stock_status !== 'IN_STOCK')) continue;
    const regular = min?.regular_price?.value ?? 0;
    out.push({
      externalId: it.sku,
      title: it.name,
      price,
      listPrice: regular > price ? regular : null,
      currency: min?.regular_price?.currency,
      url: `${origin}/${it.url_key}${urlSuffix}`,
      imageUrl: it.small_image?.url ?? null,
    });
  }
  return out;
}

export interface MagentoStoreConfig {
  id: string;
  name: string;
  host: string;
  /** Terminación de las ligas de producto; casi siempre vacía o ".html". */
  urlSuffix?: string;
}

export function createMagentoStore(config: MagentoStoreConfig, http: HttpGet): StoreAdapter {
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
      const size = Math.min(ctx.limit, 24);
      const gql = `{products(search:${JSON.stringify(query)},pageSize:${size}){items{name sku url_key price_range{minimum_price{regular_price{value currency}final_price{value}}}small_image{url}stock_status}}}`;
      const res = await http(`${origin}/graphql?query=${encodeURIComponent(gql)}`, { accept: 'json', signal: ctx.signal });
      return parseMagentoProducts(res.body, origin, config.urlSuffix ?? '');
    },
  };
}
