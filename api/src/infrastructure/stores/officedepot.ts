import * as cheerio from 'cheerio';
import type { SearchContext, StoreAdapter } from '../../application/ports.ts';
import { StoreBlockedError } from '../../application/ports.ts';
import type { RawOffer } from '../../domain/offer.ts';
import { parseMoney } from '../../domain/text.ts';
import type { HttpGet } from '../http/httpClient.ts';

const ORIGIN = 'https://www.officedepot.com.mx';

/**
 * Office Depot México: sus datos estructurados solo traen 4 productos, así que se leen las tarjetas de la
 * página de resultados (24 por página). La marca viene en el evento de clic de cada tarjeta.
 */
export function parseOfficeDepotSearch(html: string): RawOffer[] {
  if (!/product-item|officedepot/i.test(html)) throw new StoreBlockedError('Office Depot no devolvió la página de resultados.');
  const $ = cheerio.load(html);
  const out: RawOffer[] = [];
  $('.product-item').each((_, el) => {
    const card = $(el);
    const link = card.find('a.product-description').first();
    const href = link.attr('href');
    const title = card.find('.name h2').first().text().trim() || link.attr('title')?.trim();
    const sku = card.find('.product-sku .name-add.font-medium').first().text().trim() || href?.match(/\/p\/(\d+)/)?.[1];
    if (!href || !title || !sku) return;
    const price = parseMoney(card.find('.discountedPrice-grid').first().text()) ?? parseMoney(card.find('.bp-original').first().text());
    if (!price) return;
    const listPrice = parseMoney(card.find('.beforePrice-grid').first().text());
    // onProductClickDataLayer('sku','nombre','categoría','MARCA','precio', ...)
    const onclick = link.attr('onclick') ?? '';
    const brand = onclick.match(/onProductClickDataLayer\('[^']*','[^']*','[^']*','([^']*)'/)?.[1]?.trim() || null;
    const img = card.find('img').first();
    const src = img.attr('data-src') ?? img.attr('src');
    out.push({
      externalId: sku,
      title,
      brand,
      price,
      listPrice,
      url: href.startsWith('http') ? href : ORIGIN + href,
      imageUrl: src ? (src.startsWith('http') ? src : ORIGIN + src) : null,
    });
  });
  return out;
}

export function createOfficeDepotStore(http: HttpGet): StoreAdapter {
  return {
    info: {
      id: 'officedepot',
      name: 'Office Depot',
      country: 'MX',
      homepage: ORIGIN,
      access: 'pagina-web',
      availability: 'activa',
      note: 'Se lee de su página de resultados. Para algunas búsquedas la tienda abre una categoría en vez de la lista y aquí sale sin resultados.',
    },
    currency: 'MXN',
    async search(query: string, ctx: SearchContext) {
      const res = await http(`${ORIGIN}/officedepot/en/search/?text=${encodeURIComponent(query).replace(/%20/g, '+')}`, { accept: 'html', signal: ctx.signal });
      return parseOfficeDepotSearch(res.body).slice(0, ctx.limit);
    },
  };
}
