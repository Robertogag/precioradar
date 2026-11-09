import type { SearchContext, StoreAdapter } from '../../application/ports.ts';
import { StoreBlockedError } from '../../application/ports.ts';
import type { RawOffer } from '../../domain/offer.ts';
import type { HttpGet } from '../http/httpClient.ts';

/** Liverpool y Suburbia son del mismo grupo y usan la misma plataforma: un solo lector sirve a las dos. */
export interface LiverpoolPlatformConfig {
  id: string;
  name: string;
  origin: string;
  /** Servidor de imágenes cuando el registro no trae galería. */
  imageHost: string;
  note: string;
}

export const LIVERPOOL: LiverpoolPlatformConfig = {
  id: 'liverpool',
  name: 'Liverpool',
  origin: 'https://www.liverpool.com.mx',
  imageHost: 'sp632.liverpool.com.mx',
  note: 'Se lee de su página de resultados; si Liverpool cambia el sitio hay que ajustar el lector.',
};

export const SUBURBIA: LiverpoolPlatformConfig = {
  id: 'suburbia',
  name: 'Suburbia',
  origin: 'https://www.suburbia.com.mx',
  imageHost: 'sp871.suburbia.com.mx',
  note: 'Misma plataforma que Liverpool. Antes de servir la página pasa por un inicio de sesión anónimo; se siguen esas redirecciones como lo haría un navegador.',
};

interface LiverpoolPrice {
  price?: number;
  minPrice?: number;
}
interface LiverpoolRecord {
  productId: string;
  title: string;
  brand?: string;
  seller?: string[];
  priceInfo?: { salePrice?: number; listPrice?: LiverpoolPrice; promoPrice?: LiverpoolPrice };
  ratingInfo?: { productRatingCount?: number; productAvgRating?: number };
  featureFlags?: { isMarketPlace?: boolean };
  variantsColor?: { skuId?: string; galleryContent?: { type?: string; url?: string }[] }[];
}

/**
 * Liverpool no tiene API pública: los resultados vienen dentro de la propia página, en los fragmentos
 * que Next.js manda al navegador (self.__next_f.push). Aquí se unen y se des-escapan.
 */
export function decodeNextFlight(html: string): string {
  let flight = '';
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g)) {
    try {
      flight += JSON.parse(m[1]!) as string;
    } catch {
      // fragmento incompleto: se ignora
    }
  }
  return flight;
}

/** Recorta el arreglo JSON que empieza en `start` respetando cadenas y anidación. */
function sliceJsonArray(text: string, start: number): string | null {
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

const positive = (n: number | undefined): n is number => typeof n === 'number' && n > 0;

export function parseLiverpoolSearch(html: string, cfg: LiverpoolPlatformConfig = LIVERPOOL): RawOffer[] {
  const flight = decodeNextFlight(html);
  const marker = '"records":';
  const at = flight.indexOf(marker + '[');
  if (at === -1) {
    // Página válida sin resultados, o una página que no es el buscador.
    if (flight.length === 0) throw new StoreBlockedError(`${cfg.name} no devolvió la página de resultados.`);
    return [];
  }
  const json = sliceJsonArray(flight, at + marker.length);
  if (!json) return [];
  const records = JSON.parse(json) as LiverpoolRecord[];

  const out: RawOffer[] = [];
  for (const r of records) {
    const info = r.priceInfo;
    if (!info) continue;
    const candidates = [info.promoPrice?.price, info.promoPrice?.minPrice, info.salePrice].filter(positive);
    const list = [info.listPrice?.price, info.listPrice?.minPrice].find(positive) ?? null;
    const price = candidates.length > 0 ? Math.min(...candidates) : list;
    if (!price) continue;
    const firstImage = r.variantsColor?.[0]?.galleryContent?.find((g) => g.url)?.url;
    const skuId = r.variantsColor?.[0]?.skuId;
    const seller = r.featureFlags?.isMarketPlace ? r.seller?.[0] : null;
    out.push({
      externalId: r.productId,
      title: r.title,
      brand: r.brand ?? null,
      price,
      listPrice: list,
      url: `${cfg.origin}/tienda/pdp/${slugify(r.title)}/${r.productId}`,
      imageUrl: firstImage ?? (skuId ? `https://${cfg.imageHost}/i/${skuId}.jpg` : null),
      rating: r.ratingInfo?.productAvgRating ?? null,
      reviews: r.ratingInfo?.productRatingCount ?? null,
      seller: seller ?? null,
    });
  }
  return out;
}

export function createLiverpoolPlatformStore(cfg: LiverpoolPlatformConfig, http: HttpGet): StoreAdapter {
  return {
    info: {
      id: cfg.id,
      name: cfg.name,
      country: 'MX',
      homepage: cfg.origin,
      access: 'pagina-web',
      availability: 'activa',
      note: cfg.note,
    },
    currency: 'MXN',
    async search(query: string, ctx: SearchContext) {
      const res = await http(`${cfg.origin}/tienda?s=${encodeURIComponent(query)}`, { accept: 'html', signal: ctx.signal });
      return parseLiverpoolSearch(res.body, cfg).slice(0, ctx.limit);
    },
  };
}

export const createLiverpoolStore = (http: HttpGet): StoreAdapter => createLiverpoolPlatformStore(LIVERPOOL, http);
/** Suburbia necesita el cliente que guarda cookies entre redirecciones. */
export const createSuburbiaStore = (http: HttpGet): StoreAdapter => createLiverpoolPlatformStore(SUBURBIA, http);
