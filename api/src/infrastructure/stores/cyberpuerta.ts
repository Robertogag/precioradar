import type { SearchContext, StoreAdapter } from '../../application/ports.ts';
import type { RawOffer } from '../../domain/offer.ts';
import type { HttpGet } from '../http/httpClient.ts';

const ORIGIN = 'https://www.cyberpuerta.mx';

interface LdOffer {
  price?: number | string;
  lowPrice?: number | string;
  availability?: string;
}
interface LdProduct {
  '@type'?: string;
  name?: string;
  url?: string;
  sku?: string;
  gtin12?: string;
  gtin13?: string;
  image?: string[] | string;
  brand?: { name?: string };
  offers?: LdOffer;
}
interface LdNode {
  '@type'?: string;
  itemListElement?: { item?: LdProduct }[];
}

/** Cyberpuerta publica sus resultados como datos estructurados (schema.org) dentro de la página. */
export function parseCyberpuertaSearch(html: string): RawOffer[] {
  const out: RawOffer[] = [];
  for (const m of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    let data: { '@graph'?: LdNode[] } & LdNode;
    try {
      data = JSON.parse(m[1]!) as typeof data;
    } catch {
      continue;
    }
    const nodes = data['@graph'] ?? [data];
    for (const node of nodes) {
      if (node['@type'] !== 'ItemList') continue;
      for (const entry of node.itemListElement ?? []) {
        const p = entry.item;
        if (!p?.name || !p.url) continue;
        if (p.offers?.availability && !/InStock/i.test(p.offers.availability)) continue;
        const price = Number(p.offers?.price ?? p.offers?.lowPrice);
        if (!price) continue;
        const image = Array.isArray(p.image) ? p.image[0] : p.image;
        out.push({
          externalId: p.sku ?? p.url,
          title: p.name,
          brand: p.brand?.name ?? null,
          price,
          url: p.url,
          imageUrl: image ?? null,
          gtin: p.gtin13 ?? p.gtin12 ?? null,
        });
      }
    }
  }
  return out;
}

export function createCyberpuertaStore(http: HttpGet): StoreAdapter {
  return {
    info: {
      id: 'cyberpuerta',
      name: 'Cyberpuerta',
      country: 'MX',
      homepage: ORIGIN,
      access: 'pagina-web',
      availability: 'activa',
      note: 'Solo cómputo y electrónica. No publica precio anterior, así que no muestra descuento.',
    },
    currency: 'MXN',
    async search(query: string, ctx: SearchContext) {
      const url = `${ORIGIN}/index.php?cl=search&searchparam=${encodeURIComponent(query).replace(/%20/g, '+')}`;
      const res = await http(url, { accept: 'html', signal: ctx.signal });
      return parseCyberpuertaSearch(res.body).slice(0, ctx.limit);
    },
  };
}
