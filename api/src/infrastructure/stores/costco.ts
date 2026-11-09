import type { SearchContext, StoreAdapter } from '../../application/ports.ts';
import type { RawOffer } from '../../domain/offer.ts';
import { type HttpGet, parseJson } from '../http/httpClient.ts';

const ORIGIN = 'https://www.costco.com.mx';

interface CostcoMoney {
  value: number;
}
interface CostcoProduct {
  code: string;
  name: string;
  url: string;
  price?: CostcoMoney;
  basePrice?: CostcoMoney;
  images?: { format: string; url: string }[];
  averageRating?: number;
  numberOfReviews?: number;
  stock?: { stockLevelStatus?: string };
}
interface CostcoSearch {
  products?: CostcoProduct[];
}

/** Costco México publica su buscador como servicio JSON. `price` ya trae aplicado el descuento; `basePrice` es el precio regular. */
export function parseCostcoSearch(body: string): RawOffer[] {
  const data = parseJson<CostcoSearch>(body);
  const out: RawOffer[] = [];
  for (const p of data.products ?? []) {
    const price = p.price?.value;
    if (!price || p.stock?.stockLevelStatus === 'outOfStock') continue;
    const image = p.images?.find((i) => i.format === 'product') ?? p.images?.[0];
    out.push({
      externalId: p.code,
      title: p.name,
      price,
      listPrice: p.basePrice?.value ?? null,
      url: ORIGIN + p.url,
      imageUrl: image ? ORIGIN + image.url : null,
      rating: p.averageRating ?? null,
      reviews: p.numberOfReviews ?? null,
    });
  }
  return out;
}

export function createCostcoStore(http: HttpGet): StoreAdapter {
  return {
    info: {
      id: 'costco',
      name: 'Costco',
      country: 'MX',
      homepage: ORIGIN,
      access: 'catalogo-publico',
      availability: 'activa',
      note: 'Precios para socios: comprar requiere membresía.',
    },
    currency: 'MXN',
    async search(query: string, ctx: SearchContext) {
      const url = `${ORIGIN}/rest/v2/mexico/products/search?fields=FULL&query=${encodeURIComponent(query)}&pageSize=${Math.min(ctx.limit, 48)}&lang=es_MX&curr=MXN`;
      const res = await http(url, { accept: 'json', signal: ctx.signal });
      return parseCostcoSearch(res.body);
    },
  };
}
