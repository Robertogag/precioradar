import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { StoreBlockedError } from '../src/application/ports.ts';
import { parseAmazonSearch } from '../src/infrastructure/stores/amazon.ts';
import { parseCostcoSearch } from '../src/infrastructure/stores/costco.ts';
import { parseCyberpuertaSearch } from '../src/infrastructure/stores/cyberpuerta.ts';
import { parseHomeDepotSearch } from '../src/infrastructure/stores/homedepot.ts';
import { SUBURBIA, parseLiverpoolSearch } from '../src/infrastructure/stores/liverpool.ts';
import { parseMeliSearch } from '../src/infrastructure/stores/mercadolibre.ts';
import { parseOfficeDepotSearch } from '../src/infrastructure/stores/officedepot.ts';
import { parseVtexProducts } from '../src/infrastructure/stores/vtex.ts';

/** Respuestas REALES de cada tienda a la búsqueda "iphone 15", guardadas el 6-nov-2026. */
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('lectores de tiendas contra respuestas reales', () => {
  it('VTEX (Elektra): precio, precio de lista, código de barras y solo lo que tiene existencia', () => {
    const offers = parseVtexProducts(fixture('elektra.json'), 'Elektra');
    expect(offers.length).toBe(5);
    // La primera variante de "iPhone 15" viene agotada (precio 0): se toma otra variante que sí tiene existencia.
    const plain = offers.find((o) => o.title === 'iPhone 15')!;
    expect(plain.price).toBeGreaterThan(0);
    expect(offers.every((o) => o.price > 0)).toBe(true);
    const pro = offers.find((o) => o.title.includes('PRO 256GB'))!;
    expect(pro.price).toBe(20999);
    expect(pro.listPrice).toBe(26999);
    expect(pro.gtin).toBe('195949350726');
    expect(pro.seller).toBe('CEL');
    expect(pro.url).toMatch(/^https:\/\/www\.elektra\.mx\//);
  });

  it('VTEX (Chedraui): mismo lector, otra tienda', () => {
    const offers = parseVtexProducts(fixture('chedraui.json'), 'Chedraui');
    expect(offers).toHaveLength(5);
    expect(offers[0]).toMatchObject({ price: 10890, listPrice: 14299, brand: 'Apple' });
  });

  it('Costco: el precio ya trae el descuento y el regular queda como precio anterior', () => {
    const offers = parseCostcoSearch(fixture('costco.json'));
    const scott = offers.find((o) => o.title.startsWith('Scott'))!;
    expect(scott.price).toBe(429);
    expect(scott.listPrice).toBe(519);
    expect(scott.url).toBe('https://www.costco.com.mx/Ferreteria-Llantas-y-Automotriz/Cuidado-Automotriz/Limpieza-Automotriz/Scott-Toalla-Multiusos-10-Rollos/p/1509965');
  });

  it('Liverpool: saca los productos de los fragmentos de la página y toma el precio de promoción', () => {
    const offers = parseLiverpoolSearch(fixture('liverpool.html'));
    expect(offers.length).toBe(56);
    expect(offers[0]).toMatchObject({
      title: 'iPhone 15 6.1 pulgadas Super Retina XDR',
      brand: 'APPLE',
      price: 16104.6,
      listPrice: 17894,
      url: 'https://www.liverpool.com.mx/tienda/pdp/iphone-15-6-1-pulgadas-super-retina-xdr/1142680818',
    });
    expect(offers[0]!.imageUrl).toMatch(/^https:\/\/.*liverpool\.com\.mx\/.*\.jpg$/);
  });

  it('Amazon: título, precio, imagen y liga corta por ASIN', () => {
    const offers = parseAmazonSearch(fixture('amazon.html'));
    expect(offers.length).toBeGreaterThan(30);
    const first = offers.find((o) => o.externalId === 'B0CLN5XNR8')!;
    expect(first.title).toBe('Apple iPhone 15 128GB Negro Desbloqueado (Reacondicionado) Esim');
    expect(first.price).toBe(8459);
    expect(first.url).toBe('https://www.amazon.com.mx/dp/B0CLN5XNR8');
    expect(first.rating).toBe(3.8);
  });

  it('Amazon: si responde con captcha se reporta bloqueada, no "sin resultados"', () => {
    expect(() => parseAmazonSearch('<html><form action="/errors/validateCaptcha"></form></html>')).toThrow(StoreBlockedError);
  });

  it('Cyberpuerta: lee los datos estructurados de la página', () => {
    const offers = parseCyberpuertaSearch(fixture('cyberpuerta.html'));
    expect(offers).toHaveLength(16);
    expect(offers[0]).toMatchObject({ title: 'Apple iPhone 15, 128GB, Rosa', price: 14279, brand: 'APPLE', gtin: '195949115998' });
  });

  it('Suburbia: mismo lector que Liverpool, con sus propias ligas e imágenes (respuesta real a "tenis nike", 7-nov-2026)', () => {
    const offers = parseLiverpoolSearch(fixture('suburbia.html'), SUBURBIA);
    expect(offers.length).toBeGreaterThan(10);
    expect(offers[0]).toMatchObject({ title: 'Tenis Summits de hombre para entrenamiento', brand: 'SKECHERS', price: 979.3, listPrice: 1399 });
    expect(offers[0]!.url).toMatch(/^https:\/\/www\.suburbia\.com\.mx\/tienda\/pdp\//);
    expect(offers[0]!.imageUrl).toMatch(/suburbia\.com\.mx/);
  });

  it('The Home Depot: productos de los datos de Next.js (respuesta real a "taladro dewalt", 7-nov-2026)', () => {
    const offers = parseHomeDepotSearch(fixture('homedepot.html'));
    expect(offers).toHaveLength(28);
    expect(offers[0]).toMatchObject({ externalId: '226146', brand: 'DEWALT', price: 5197, listPrice: null });
    expect(offers[0]!.title).toMatch(/^KIT ESMERILADORA 20V/);
    expect(offers[0]!.url).toBe('https://www.homedepot.com.mx/p/dewalt-kit-esmeriladora-20v-bateria-5ah-cargador-dewalt-226146-226146');
    expect(offers[0]!.imageUrl).toMatch(/^https:\/\/www\.homedepot\.com\.mx\/hclstore\//);
  });

  it('Office Depot: tarjetas de la página con precio, precio anterior y marca (respuesta real a "laptop lenovo", 7-nov-2026)', () => {
    const offers = parseOfficeDepotSearch(fixture('officedepot.html'));
    expect(offers).toHaveLength(24);
    expect(offers[0]).toMatchObject({ externalId: '100282025', brand: 'LENOVO', price: 10299, listPrice: 12999 });
    expect(offers[0]!.title).toBe('Laptop Lenovo V14 G4 AMD Ryzen 5 8GB RAM 512GB SSD 14 pulgadas');
    expect(offers[0]!.url).toMatch(/^https:\/\/www\.officedepot\.com\.mx\/officedepot\/en\/.*\/p\/100282025$/);
    expect(offers[0]!.imageUrl).toMatch(/^https:\/\/www\.officedepot\.com\.mx\/medias\//);
  });

  it('Mercado Libre: traduce la respuesta de su API oficial (forma documentada; sin probar en vivo)', () => {
    const body = JSON.stringify({
      results: [
        {
          id: 'MLM1',
          title: 'Apple iPhone 15 128 GB',
          price: 14999,
          original_price: 17999,
          currency_id: 'MXN',
          permalink: 'https://articulo.mercadolibre.com.mx/MLM-1',
          thumbnail: 'http://http2.mlstatic.com/D_1-I.jpg',
          condition: 'new',
          seller: { nickname: 'TIENDA_OFICIAL' },
          attributes: [{ id: 'BRAND', value_name: 'Apple' }, { id: 'GTIN', value_name: '195949035234' }],
        },
      ],
    });
    expect(parseMeliSearch(body)[0]).toMatchObject({
      price: 14999,
      listPrice: 17999,
      brand: 'Apple',
      gtin: '195949035234',
      condition: 'nuevo',
      imageUrl: 'https://http2.mlstatic.com/D_1-O.jpg',
    });
  });
});
