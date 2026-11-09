import type { SearchContext, StoreAdapter } from '../../application/ports.ts';
import { StoreBlockedError } from '../../application/ports.ts';
import type { RawOffer } from '../../domain/offer.ts';
import type { HttpGet } from '../http/httpClient.ts';

const ORIGIN = 'https://www.homedepot.com.mx';

interface HdPrice {
  usage?: string;
  value?: string;
}
interface HdProduct {
  id?: string;
  partNumber?: string;
  name?: string;
  manufacturer?: string;
  thumbnail?: string;
  buyable?: string;
  price?: HdPrice[];
  seo?: { href?: string };
  'x_ratings.rating'?: string;
  'x_ratings.total_reviews'?: string;
}

const num = (v: string | undefined): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * The Home Depot México: la página de resultados trae los productos en los datos de Next.js (__NEXT_DATA__),
 * bajo varias consultas precargadas; la lista de productos es la más larga que tiene `contents`.
 */
export function parseHomeDepotSearch(html: string): RawOffer[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new StoreBlockedError('Home Depot no devolvió la página de resultados.');
  const data = JSON.parse(m[1]!) as { props?: { pageProps?: { fallback?: Record<string, unknown> } } };
  const fallback = data.props?.pageProps?.fallback ?? {};

  let products: HdProduct[] = [];
  for (const value of Object.values(fallback)) {
    const contents = (value as { contents?: unknown } | null)?.contents;
    if (Array.isArray(contents) && contents.length > products.length && contents.some((c) => c && typeof c === 'object' && 'partNumber' in c)) {
      products = contents as HdProduct[];
    }
  }

  const out: RawOffer[] = [];
  for (const p of products) {
    if (!p.name || !p.partNumber || p.buyable === 'false') continue;
    const offer = num(p.price?.find((x) => x.usage === 'Offer')?.value);
    const display = num(p.price?.find((x) => x.usage === 'Display')?.value);
    const price = offer ?? display;
    if (!price) continue;
    out.push({
      externalId: p.partNumber,
      title: p.name,
      brand: p.manufacturer ?? null,
      price,
      listPrice: display && display > price ? display : null,
      url: p.seo?.href ? ORIGIN + p.seo.href : `${ORIGIN}/p/${p.partNumber}`,
      imageUrl: p.thumbnail ? ORIGIN + p.thumbnail : null,
      rating: num(p['x_ratings.rating']),
      reviews: num(p['x_ratings.total_reviews']),
    });
  }
  return out;
}

export function createHomeDepotStore(http: HttpGet): StoreAdapter {
  return {
    info: {
      id: 'homedepot',
      name: 'The Home Depot',
      country: 'MX',
      homepage: ORIGIN,
      access: 'pagina-web',
      availability: 'activa',
      note: 'Se lee de su página de resultados. Cuando la búsqueda coincide con un solo producto, la tienda abre ese producto en vez de la lista y aquí sale sin resultados.',
    },
    currency: 'MXN',
    async search(query: string, ctx: SearchContext) {
      const res = await http(`${ORIGIN}/s/${encodeURIComponent(query)}`, { accept: 'html', signal: ctx.signal });
      // Redirigió a un producto suelto: no hay lista que leer.
      if (/\/p\//.test(new URL(res.url).pathname)) return [];
      return parseHomeDepotSearch(res.body).slice(0, ctx.limit);
    },
  };
}
