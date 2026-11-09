import * as cheerio from 'cheerio';
import type { SearchContext, StoreAdapter } from '../../application/ports.ts';
import { StoreBlockedError } from '../../application/ports.ts';
import type { RawOffer } from '../../domain/offer.ts';
import { parseMoney } from '../../domain/text.ts';
import type { HttpGet } from '../http/httpClient.ts';

const ORIGIN = 'https://www.amazon.com.mx';

/**
 * Amazon México, leído de su página de resultados.
 * Es la fuente más frágil: Amazon corta a los lectores automáticos sin aviso. El camino estable es su
 * API de afiliados (Amazon Associates), que además paga comisión; este lector existe para arrancar.
 */
export function parseAmazonSearch(html: string): RawOffer[] {
  if (/api-services-support@amazon\.com|validateCaptcha|Type the characters you see/i.test(html)) {
    throw new StoreBlockedError('Amazon pidió captcha.');
  }
  const $ = cheerio.load(html);
  const out: RawOffer[] = [];
  $('div[data-component-type="s-search-result"][data-asin]').each((_, el) => {
    const card = $(el);
    const asin = card.attr('data-asin');
    if (!asin) return;
    const h2 = card.find('h2').first();
    const title = (h2.attr('aria-label') ?? h2.text()).replace(/^Anuncio patrocinado:\s*/i, '').trim();
    const price = parseMoney(card.find('span.a-price:not(.a-text-price) span.a-offscreen').first().text());
    if (!title || !price) return;
    const listPrice = parseMoney(card.find('span.a-price.a-text-price span.a-offscreen').first().text());
    const ratingText = card.find('span.a-icon-alt').first().text();
    const rating = Number(ratingText.match(/^(\d(?:[.,]\d)?)/)?.[1]?.replace(',', '.')) || null;
    const reviewsText = card.find('a[href*="#customerReviews"] span, span.s-underline-text').first().text();
    const reviews = Number(reviewsText.replace(/[^\d]/g, '')) || null;
    out.push({
      externalId: asin,
      title,
      price,
      listPrice,
      url: `${ORIGIN}/dp/${asin}`,
      imageUrl: card.find('img.s-image').attr('src') ?? null,
      rating,
      reviews,
    });
  });
  // Página sin resultados y sin el armazón del buscador ni el aviso de "no encontramos": no es que no haya,
  // es que Amazon sirvió otra cosa (bloqueo suave). Se reporta como bloqueada para que entre la memoria de la tienda.
  if (out.length === 0 && $('.s-main-slot, div[data-component-type="s-search-result"]').length === 0 && !/no se encontraron resultados|no hay resultados|No results for|s-no-results/i.test(html)) {
    throw new StoreBlockedError('Amazon devolvió una página sin resultados ni buscador.');
  }
  return out;
}

export function createAmazonStore(http: HttpGet): StoreAdapter {
  return {
    info: {
      id: 'amazon',
      name: 'Amazon',
      country: 'MX',
      homepage: ORIGIN,
      access: 'pagina-web',
      availability: 'activa',
      note: 'Se lee de su página de resultados y Amazon puede cortar el acceso en cualquier momento. Lo estable es su API de afiliados.',
    },
    currency: 'MXN',
    async search(query: string, ctx: SearchContext) {
      const res = await http(`${ORIGIN}/s?k=${encodeURIComponent(query)}`, { accept: 'html', signal: ctx.signal });
      return parseAmazonSearch(res.body).slice(0, ctx.limit);
    },
  };
}
