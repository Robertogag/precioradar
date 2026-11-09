import { describe, expect, it } from 'vitest';
import type { Offer } from '../../shared/contracts.ts';
import { groupOffers, modelCodes, sortGroups } from '../src/domain/grouping.ts';
import { commonTokens, detectAccessory, detectCondition, discountPct, isExactMatch, scoreRelevance, toOffer } from '../src/domain/offer.ts';
import { splitExtras } from '../src/domain/bundle.ts';
import { normalize, normalizeGtin, parseMoney, tokenize } from '../src/domain/text.ts';

const store = { id: 't', name: 'Tienda', currency: 'MXN' };
const q = (s: string) => tokenize(s);

describe('texto', () => {
  it('normaliza acentos, signos y decimales', () => {
    expect(normalize('Cámara  Réflex 6.1" ¡Oferta!')).toBe('camara reflex 6.1 pulgadas oferta');
  });
  it('pega la unidad al número y deja las palabras en singular', () => {
    expect(tokenize('Audífonos Sony 128 GB de 55 pulgadas')).toEqual(['audifono', 'sony', '128gb', '55pulgadas']);
    // La e final se quita (forma canónica para que "serie" y "series" empaten); el título que se enseña no cambia.
    expect(tokenize('iPhone15 128GB')).toEqual(['iphon', '15', '128gb']);
  });
  it('lee precios con comas y centavos', () => {
    expect(parseMoney('$17,999.00')).toBe(17999);
    expect(parseMoney('$ 849.5')).toBe(849.5);
    expect(parseMoney('gratis')).toBeNull();
  });
  it('hace comparable el código de barras entre tiendas', () => {
    expect(normalizeGtin('0195949019944')).toBe('195949019944');
    expect(normalizeGtin('195949019944')).toBe('195949019944');
    expect(normalizeGtin('123')).toBeNull();
  });
});

describe('relevancia', () => {
  it('los números mandan: iphone 15 no acepta iPhone 16', () => {
    expect(scoreRelevance(q('iPhone 16 6.1 pulgadas'), q('iphone 15'))).toBe(0);
    expect(scoreRelevance(q('Apple iPhone 15 128GB'), q('iphone 15'))).toBe(1);
  });
  it('acepta que la tienda nombre distinto si coincide la mitad de las palabras', () => {
    expect(scoreRelevance(q('Samsung TV 55 Crystal UHD'), q('pantalla samsung 55'))).toBeGreaterThan(0);
    expect(scoreRelevance(q('Scott Toalla Multiusos 10 Rollos'), q('iphone 15'))).toBe(0);
  });
  it('un número pegado a su unidad cuenta ("55" vs "55pulgadas")', () => {
    expect(scoreRelevance(q('Pantalla Samsung 55 pulgadas'), q('pantalla samsung 55'))).toBe(1);
  });
});

describe('accesorios y condición', () => {
  it('marca fundas y micas como accesorio', () => {
    expect(detectAccessory(q('Funda MagSafe Transparente Compatible Iphone 15'), q('iphone 15'))).toBe(true);
    expect(detectAccessory(q('Mica de cristal templado para iPhone 15'), q('iphone 15'))).toBe(true);
  });
  it('una palabra débil solo cuenta si va antes de lo buscado', () => {
    expect(detectAccessory(q('Cargador para iPhone 15 20W'), q('iphone 15'))).toBe(true);
    expect(detectAccessory(q('Apple iPhone 15 128GB con cargador'), q('iphone 15'))).toBe(false);
  });
  it('nunca marca accesorio lo que el usuario pidió', () => {
    expect(detectAccessory(q('Funda de silicona iPhone 15'), q('funda iphone 15'))).toBe(false);
  });
  it('detecta reacondicionados aunque vengan abreviados', () => {
    expect(detectCondition('Apple Iphone 15 128Gb Azul Esim Rfb')).toBe('reacondicionado');
    expect(detectCondition('Apple Iphone 15 128Gb Verde Esim Reacondicioando')).toBe('reacondicionado');
    expect(detectCondition('Apple iPhone 15 (Reacondicionado)')).toBe('reacondicionado');
    expect(detectCondition('Apple iPhone 15 128GB Negro')).toBe('nuevo');
  });
});

describe('oferta', () => {
  it('calcula el descuento solo si el precio anterior es mayor', () => {
    expect(discountPct(750, 1000)).toBe(25);
    expect(discountPct(1000, 1000)).toBeNull();
    expect(discountPct(1000, null)).toBeNull();
  });
  it('descarta datos sin precio o sin liga', () => {
    expect(toOffer({ externalId: '1', title: 'X', price: 0, url: 'https://x' }, store, [])).toBeNull();
    expect(toOffer({ externalId: '1', title: 'X', price: 10, url: '' }, store, [])).toBeNull();
  });
});

describe('agrupado entre tiendas', () => {
  const make = (storeId: string, title: string, price: number, extra: Partial<Offer> = {}): Offer => ({
    ...toOffer({ externalId: `${storeId}-${title}`, title, price, url: 'https://x', brand: extra.brand ?? null, gtin: extra.gtin ?? null }, { id: storeId, name: storeId, currency: 'MXN' }, q('iphone 15'))!,
  });

  it('junta el mismo código de barras aunque el título sea distinto', () => {
    const groups = groupOffers(
      [make('a', 'iPhone 15 Rosa', 15000, { gtin: '195949035234' }), make('b', 'Celular Apple iPhone 15', 14000, { gtin: '0195949035234' })],
      q('iphone 15'),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.best.storeId).toBe('b');
    expect(groups[0]!.spread).toBe(1000);
  });

  it('junta por marca + especificaciones y separa capacidades y modelos hermanos', () => {
    const groups = groupOffers(
      [
        make('a', 'Apple iPhone 15 128GB Negro', 15000, { brand: 'Apple' }),
        make('b', 'Apple iPhone 15, 128GB, Rosa', 14500), // sin marca declarada: se deduce de las demás
        make('c', 'Apple iPhone 15 256GB Negro', 17000, { brand: 'APPLE' }),
        make('d', 'Apple iPhone 15 Pro 128GB', 21000, { brand: 'Apple' }),
      ],
      q('iphone 15'),
    );
    expect(groups).toHaveLength(3);
    const first = sortGroups(groups, 'relevancia')[0]!;
    expect(first.storeCount).toBe(2);
    expect(first.minPrice).toBe(14500);
  });

  it('junta por clave de modelo del fabricante aunque el resto del título no se parezca', () => {
    const tv = q('pantalla samsung 55');
    const mk = (storeId: string, title: string, price: number) =>
      toOffer({ externalId: storeId, title, price, url: 'https://x' }, { id: storeId, name: storeId, currency: 'MXN' }, tv)!;
    const groups = groupOffers(
      [
        mk('amazon', 'Samsung Smart TV 55" Crystal UN55U8500HFXZX', 7574),
        mk('costco', 'Samsung Pantalla 55" Crystal UHD Smart TV UN55U8500HFXZX', 7999),
        mk('elektra', 'Pantalla UHD Samsung 55 Pulgadas 4K Smart UN55U8200', 7199),
      ],
      tv,
    );
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.storeCount === 2)!.best.storeId).toBe('amazon');
    expect(modelCodes('Celular 128GB 5000mAh WH-CH530 4K')).toEqual(['whch530']);
  });

  it('caso real 6-nov: una microSD "para Nintendo Switch 2 256GB" no se junta con la consola', () => {
    const sw = q('nintendo switch 2');
    const mk = (storeId: string, title: string, price: number, brand: string | null = null) =>
      toOffer({ externalId: storeId, title, price, url: 'https://x', brand }, { id: storeId, name: storeId, currency: 'MXN' }, sw)!;
    const card = mk('costco', 'Samsung Tarjeta microSD Express de 256GB para Nintendo Switch 2', 1749);
    const consoles = [
      mk('liverpool', 'Consola Nintendo Switch 2 256GB', 10919.22, 'Nintendo'),
      mk('elektra', 'Consola Nintendo Switch 2 256GB Negro', 12899, 'Nintendo'),
      mk('amazon', 'Nintendo Switch 2 Consola 256GB', 14299),
    ];
    // 1) Se reconoce como accesorio, así que por omisión ni sale.
    expect(card.isAccessory).toBe(true);
    expect(consoles.every((c) => !c.isAccessory)).toBe(true);
    // 2) Aunque el usuario pida ver accesorios, nunca queda en el grupo de la consola.
    const groups = groupOffers([card, ...consoles], sw);
    const cardGroup = groups.find((g) => g.offers.some((o) => o.storeId === 'costco'))!;
    expect(cardGroup.storeCount).toBe(1);
    expect(groups.find((g) => g.storeCount === 3)!.minPrice).toBe(10919.22);
  });

  it('caso real 8-nov: la misma consola con títulos distintos, marca escrita distinto y un paquete sin capacidad', () => {
    const sw = q('nintendo switch 2');
    const mk = (storeId: string, title: string, price: number, brand: string | null = null) =>
      toOffer({ externalId: storeId, title, price, url: 'https://x', brand }, { id: storeId, name: storeId, currency: 'MXN' }, sw)!;
    const groups = groupOffers(
      [
        mk('liverpool', 'Consola Nintendo Switch 2 de 256 GB edición estándar', 10919.22, 'NINTENDO'),
        mk('cyberpuerta', 'Nintendo Switch 2, 256GB, Wi-Fi, Negro', 10979, 'NINTENDO'),
        mk('chedraui', 'Consola Nintendo Switch 2 + EA Sports FC 27', 12490, 'Nintendo Switch'),
        mk('elektra', 'Consola Nintendo Switch 2 256GB + Mario Kart World Descargable', 14899, 'Nintendo'),
      ],
      sw,
    );
    expect(groups).toHaveLength(1);
    const g = groups[0]!;
    expect(g.storeCount).toBe(4);
    expect(g.minPrice).toBe(10919.22);
    expect(g.offers.find((o) => o.storeId === 'chedraui')!.extras[0]!.toLowerCase()).toBe('ea sports fc 27');
  });

  it('caso real 8-nov: Xbox Series X 2TB en tres tiendas con títulos distintos es un solo producto; Series S no entra', () => {
    const xb = q('microsoft xbox series x 2tb');
    const mk = (storeId: string, title: string, price: number, brand: string) =>
      toOffer({ externalId: storeId, title, price, url: 'https://x', brand }, { id: storeId, name: storeId, currency: 'MXN' }, xb)!;
    const groups = groupOffers(
      [
        mk('liverpool', 'Consola Xbox Series X de 2 TB edición especial', 32699, 'MICROSOFT'),
        mk('doto', 'Microsoft Consola Xbox Series X 2TB', 28379, 'Xbox'),
        mk('coppel', 'Consola Xbox Serie X Microsoft 2 Tb Edición Especial Galaxy Black', 32999, 'Microsoft'),
        mk('elektra', 'Consola Xbox Series S 2TB Blanca', 16999, 'Microsoft'),
      ],
      xb,
    );
    // Doto dice marca "Xbox": no comparte firma con los demás, pero Liverpool y Coppel sí se juntan (una sola especificación, títulos muy parecidos).
    const main = groups.find((g) => g.offers.some((o) => o.storeId === 'liverpool'))!;
    expect(main.offers.map((o) => o.storeId).sort()).toEqual(['coppel', 'liverpool']);
    expect(groups.find((g) => g.offers.some((o) => o.storeId === 'elektra'))!.storeCount).toBe(1);
    expect(tokenize('Xbox Series X')).toEqual(tokenize('Xbox Serie X'));
    expect(tokenize('cables')).toEqual(tokenize('cable'));
  });

  it('la letra pegada al número distingue modelos: iPhone 16e no se junta con iPhone 16', () => {
    const groups = groupOffers(
      [
        make('suburbia', 'iPhone 16e 6.1 pulgadas Super Retina XDR', 11519.1, { brand: 'Apple' }),
        make('liverpool', 'iPhone 16 6.1 pulgadas Super Retina XDR', 17999.1, { brand: 'Apple' }),
        make('elektra', 'Apple iPhone 16e 128GB Negro', 11999, { brand: 'Apple' }),
      ],
      q('iphone 16'),
    );
    // El 16 queda solo; los dos 16e no se juntan entre sí porque uno dice pulgadas y el otro capacidad (nada en común que lo afirme).
    const withLiverpool = groups.find((g) => g.offers.some((o) => o.storeId === 'liverpool'))!;
    expect(withLiverpool.storeCount).toBe(1);
    expect(groups.every((g) => !g.offers.some((o) => /16e/i.test(o.title)) || !g.offers.some((o) => o.storeId === 'liverpool'))).toBe(true);
  });

  it('"Plus" no se pierde al singularizar: iPhone 16 Plus no se junta con iPhone 16', () => {
    expect(tokenize('APPLE IPHONE 16 PLUS 128GB BLANCO')).toContain('plus');
    const groups = groupOffers(
      [make('a', 'Apple iPhone 16 128GB Negro', 16999, { brand: 'Apple' }), make('b', 'APPLE IPHONE 16 PLUS 128GB BLANCO', 17999, { brand: 'Apple' })],
      q('iphone 16'),
    );
    expect(groups).toHaveLength(2);
  });

  it('un título largo en la tienda más barata no parte el grupo: las demás se encadenan con ella', () => {
    const groups = groupOffers(
      [
        make('elektra', 'Celular Apple iPhone 16 128GB Ultramarino 5G eSIM Telcel Smartphone Pantalla', 11499, { brand: 'Apple' }),
        make('cyberpuerta', 'Apple iPhone 16, 128GB, Verde', 13889, { brand: 'Apple' }),
        make('officedepot', 'Apple iPhone 16 128GB Ultramarino', 16999, { brand: 'Apple' }),
      ],
      q('iphone 16'),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.storeCount).toBe(3);
  });

  it('el título del grupo es el más central, no el de la tienda más barata', () => {
    const sw = q('nintendo switch 2');
    const mk = (storeId: string, title: string, price: number) =>
      toOffer({ externalId: storeId, title, price, url: 'https://x', brand: 'Nintendo' }, { id: storeId, name: storeId, currency: 'MXN' }, sw)!;
    const groups = groupOffers(
      [
        mk('amazon', 'Nintendo Switch 2 - Versión Nacional 256GB', 9998.99),
        mk('elektra', 'Consola Nintendo Switch 2 256GB', 9999),
        mk('liverpool', 'Consola Nintendo Switch 2 de 256 GB edición estándar', 10919.22),
      ],
      sw,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.title).toBe('Consola Nintendo Switch 2 256GB');
    expect(groups[0]!.best.storeId).toBe('amazon');
  });

  it('dos publicaciones con el mismo título largo son lo mismo aunque no haya marca ni números que lo firmen', () => {
    const sw = q('nintendo switch 2');
    const mk = (id: string, title: string, price: number) =>
      toOffer({ externalId: id, title, price, url: 'https://x' }, { id: 'elektra', name: 'Elektra', currency: 'MXN' }, sw)!;
    expect(groupOffers([mk('1', 'Nintendo Switch 2 Juego Tamagotchi Plaza', 989), mk('2', 'Nintendo Switch 2 Juego Tamagotchi Plaza', 1099)], sw)).toHaveLength(1);
    // Con precio increíble, no.
    expect(groupOffers([mk('1', 'Nintendo Switch 2 Juego Tamagotchi Plaza', 989), mk('2', 'Nintendo Switch 2 Juego Tamagotchi Plaza', 9890)], sw)).toHaveLength(2);
  });

  it('sin capacidad y con varias capacidades posibles no se adivina: "iPhone 15" queda aparte de 128 y 256', () => {
    const groups = groupOffers(
      [
        make('a', 'Apple iPhone 15 128GB', 15000, { brand: 'Apple' }),
        make('b', 'Apple iPhone 15 256GB', 17000, { brand: 'Apple' }),
        make('c', 'Apple iPhone 15', 14000, { brand: 'Apple' }),
      ],
      q('iphone 15'),
    );
    expect(groups).toHaveLength(3);
    // Con una sola capacidad en juego, sí: es la única candidata.
    expect(groupOffers([make('a', 'Apple iPhone 15 128GB', 15000, { brand: 'Apple' }), make('c', 'Apple iPhone 15', 14000, { brand: 'Apple' })], q('iphone 15'))).toHaveLength(1);
  });

  it('la letra del modelo distingue hermanos que comparten número: Galaxy A16 no es Galaxy M16', () => {
    const groups = groupOffers(
      [
        make('a', 'Samsung Galaxy A16 128GB', 3500, { brand: 'Samsung' }),
        make('b', 'Samsung Galaxy M16 128GB', 3600, { brand: 'Samsung' }),
        make('c', 'Samsung Galaxy A16 128GB Negro', 3450, { brand: 'Samsung' }),
      ],
      q('samsung galaxy'),
    );
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.storeCount === 2)!.minPrice).toBe(3450);
  });

  it('cámara y diadema son accesorios al buscar la consola; "cámara" no lo es al buscar una cámara', () => {
    const sw = q('nintendo switch 2');
    expect(detectAccessory(q('Cámara Nintendo Switch 2 Negra'), sw, 'Cámara Nintendo Switch 2 Negra')).toBe(true);
    expect(detectAccessory(q('Diadema Turtle Beach Nintendo Switch 2 Airlite'), sw)).toBe(true);
    expect(detectAccessory(q('Switch 2 Sports Resort Accessories'), sw)).toBe(true);
    // Termina en el accesorio: es el accesorio. Con "con" antes, es el aparato con regalo.
    expect(detectAccessory(q('Nintendo Switch 2 Cámara'), sw, 'Nintendo Switch 2 Cámara')).toBe(true);
    expect(detectAccessory(q('Nintendo Switch 2 Pro Controller'), sw, 'Nintendo Switch 2 Pro Controller')).toBe(true);
    expect(detectAccessory(q('Nintendo Switch 2 256GB con control'), sw, 'Nintendo Switch 2 256GB con control')).toBe(false);
    expect(detectAccessory(q('Videojuego Ea Sports FC26 Nintendo Switch 2'), sw, 'Videojuego Ea Sports FC26 Nintendo Switch 2')).toBe(true);
    const canon = q('canon r50');
    const category = commonTokens([
      { title: 'Cámara Canon EOS R50' },
      { title: 'Canon EOS R50 Cámara sin espejo' },
      { title: 'Cámara Canon R50 kit 18-45' },
      { title: 'Canon R50 cámara mirrorless' },
      { title: 'Funda para cámara Canon R50' },
    ]);
    expect(category.has('camara')).toBe(true);
    expect(detectAccessory(q('Cámara Canon EOS R50'), canon, undefined, category)).toBe(false);
    expect(detectAccessory(q('Funda para cámara Canon R50'), canon, 'Funda para cámara Canon R50', category)).toBe(true);
  });

  it('misma marca y mismos números no bastan: sin título parecido o con precio increíble no se junta', () => {
    const sw = q('nintendo switch 2');
    const mk = (storeId: string, title: string, price: number) =>
      toOffer({ externalId: storeId, title, price, url: 'https://x', brand: 'Nintendo' }, { id: storeId, name: storeId, currency: 'MXN' }, sw)!;
    // Mismo título, pero uno cuesta 5 veces más: no es creíble que sea lo mismo.
    expect(groupOffers([mk('a', 'Nintendo Switch 2 256GB', 2000), mk('b', 'Nintendo Switch 2 256GB', 10000)], sw)).toHaveLength(2);
    // Precio parecido, pero títulos que casi no comparten palabras.
    expect(
      groupOffers([mk('a', 'Nintendo Switch 2 256GB', 10000), mk('b', 'Volante Mario Kart World edición Switch 2 256GB', 10500)], sw),
    ).toHaveLength(2);
  });

  it('"para" solo indica accesorio si va antes de lo buscado', () => {
    expect(detectAccessory(q('Tarjeta microSD para Nintendo Switch 2'), q('nintendo switch 2'), 'Tarjeta microSD para Nintendo Switch 2')).toBe(true);
    expect(detectAccessory(q('Mario Kart World para Nintendo Switch 2'), q('mario kart switch 2'), 'Mario Kart World para Nintendo Switch 2')).toBe(false);
    expect(detectAccessory(q('Nintendo Switch 2 para toda la familia'), q('nintendo switch 2'), 'Nintendo Switch 2 para toda la familia')).toBe(false);
  });

  it('no agrupa cuando no hay con qué afirmar que es lo mismo', () => {
    const groups = groupOffers([make('a', 'iPhone 15', 15000), make('b', 'iPhone 15', 14000)], q('iphone 15'));
    expect(groups).toHaveLength(2);
  });

  it('deja una oferta por tienda, la más barata', () => {
    const groups = groupOffers(
      [make('a', 'Apple iPhone 15 128GB Negro', 15000, { brand: 'Apple' }), make('a', 'Apple iPhone 15 128GB Azul', 14900, { brand: 'Apple' })],
      q('iphone 15'),
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]!.offers).toHaveLength(1);
    expect(groups[0]!.minPrice).toBe(14900);
  });
});

describe('paquetes con extra (mismo producto con ventaja)', () => {
  it('separa el producto base de lo que incluye', () => {
    expect(splitExtras('Nintendo Switch 2 + Mario Kart World')).toEqual({ base: 'Nintendo Switch 2', extras: ['Mario Kart World'] });
    expect(splitExtras('Nintendo Switch 2 Bundle: EA Sports FC27')).toEqual({ base: 'Nintendo Switch 2', extras: ['EA Sports FC27'] });
    expect(splitExtras('Apple iPhone 15 (128 GB) - Negro con AppleCare+ (2 Años)')).toEqual({ base: 'Apple iPhone 15 (128 GB) - Negro', extras: ['AppleCare+ (2 Años)'] });
    expect(splitExtras('APPLE IPHONE 15 PRO 256GB NATURAL+ADAPTA')).toEqual({ base: 'APPLE IPHONE 15 PRO 256GB NATURAL', extras: ['ADAPTA'] });
  });
  it('"eSIM + SIM Física" describe el teléfono, no es un paquete', () => {
    expect(splitExtras('Apple iPhone 16 eSIM + SIM Físico')).toEqual({ base: 'Apple iPhone 16 eSIM + SIM Físico', extras: [] });
    expect(splitExtras('Apple iPhone 16 Pro Max 256GB e-Sim + Sim Física').extras).toEqual([]);
    expect(splitExtras('Nintendo Switch 2 + Mario Kart World').extras).toEqual(['Mario Kart World']);
  });

  it('no inventa extras donde no los hay', () => {
    expect(splitExtras('Combo de rotomartillo y atornillador DeWalt').extras).toEqual([]);
    expect(splitExtras('Samsung Galaxy S25+ 256GB').extras).toEqual([]);
    expect(splitExtras('Pantalla 55 pulgadas con Roku TV').extras).toEqual([]);
  });
  it('el paquete se junta con el producto solo y se recomienda si cuesta poco más', () => {
    const sw = q('nintendo switch 2');
    const mk = (storeId: string, title: string, price: number) =>
      toOffer({ externalId: `${storeId}-${price}`, title, price, url: 'https://x', brand: 'Nintendo' }, { id: storeId, name: storeId, currency: 'MXN' }, sw)!;
    const groups = groupOffers(
      [
        mk('liverpool', 'Consola Nintendo Switch 2 256GB', 10919.22),
        mk('costco', 'Nintendo Switch 2 256GB + Mario Kart World', 11499),
        mk('costco', 'Nintendo Switch 2 256GB consola', 11299), // misma tienda, sin extra: también se queda
      ],
      sw,
    );
    expect(groups).toHaveLength(1);
    const g = groups[0]!;
    expect(g.title).toBe('Consola Nintendo Switch 2 256GB');
    expect(g.offers.map((o) => o.price)).toEqual([10919.22, 11299, 11499]);
    expect(g.offers[2]!.extras).toEqual(['Mario Kart World']);
    expect(g.recommendation).toEqual({ offerId: 'costco:costco-11499', kind: 'mejor-valor', extraCost: 579.78, extras: ['Mario Kart World'] });
  });
  it('si el paquete es carísimo, la recomendación sigue siendo el más barato', () => {
    const sw = q('nintendo switch 2');
    const mk = (storeId: string, title: string, price: number) =>
      toOffer({ externalId: storeId, title, price, url: 'https://x', brand: 'Nintendo' }, { id: storeId, name: storeId, currency: 'MXN' }, sw)!;
    const [g] = groupOffers([mk('a', 'Consola Nintendo Switch 2 256GB', 10000), mk('b', 'Nintendo Switch 2 256GB + Pro Controller + Mario Kart', 13500)], sw);
    expect(g!.recommendation).toEqual({ offerId: 'a:a', kind: 'mas-barato', extraCost: 0, extras: [] });
  });
});

describe('modo exacto', () => {
  const mk = (title: string, query: string) =>
    toOffer({ externalId: '1', title, price: 100, url: 'https://x', brand: 'Samsung' }, { id: 's', name: 's', currency: 'MXN' }, q(query))!;
  it('exige todas las palabras y rechaza variantes que el usuario no pidió', () => {
    expect(isExactMatch(mk('Samsung Galaxy S25 256GB Azul', 'samsung galaxy s25'), q('samsung galaxy s25'))).toBe(true);
    expect(isExactMatch(mk('Samsung Galaxy S25 Ultra 512GB', 'samsung galaxy s25'), q('samsung galaxy s25'))).toBe(false);
    expect(isExactMatch(mk('Samsung Galaxy S25 Ultra 512GB', 'samsung galaxy s25 ultra'), q('samsung galaxy s25 ultra'))).toBe(true);
    expect(isExactMatch(mk('Samsung TV 55 Crystal', 'pantalla samsung 55'), q('pantalla samsung 55'))).toBe(false); // falta "pantalla"
  });
  it('los extras del paquete no cambian el veredicto', () => {
    expect(isExactMatch(mk('Apple iPhone 15 128GB + Apple Watch Ultra', 'apple iphone 15'), q('apple iphone 15'))).toBe(true);
  });
});
