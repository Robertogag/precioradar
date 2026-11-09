/**
 * Datos de muestra para probar la web SIN internet y sin tiendas (npm run mock). Son inventados pero con la forma
 * exacta del contrato; sirven para ver la interfaz con todos sus estados (ahorro, descuento, tienda sin
 * resultados, tienda bloqueada, etc.).
 */
import type { CountryInfo, DealsResponse, Offer, ProductGroup, SearchResponse, StoreInfo, StoreRun } from '../../shared/contracts.ts';

const STORES: Array<[string, string, string]> = [
  ['amazon', 'Amazon', 'https://www.amazon.com.mx'],
  ['liverpool', 'Liverpool', 'https://www.liverpool.com.mx'],
  ['costco', 'Costco', 'https://www.costco.com.mx'],
  ['elektra', 'Elektra', 'https://www.elektra.mx'],
  ['chedraui', 'Chedraui', 'https://www.chedraui.com.mx'],
  ['officemax', 'OfficeMax', 'https://www.officemax.com.mx'],
  ['sony', 'Sony Store', 'https://store.sony.com.mx'],
  ['whirlpool', 'Whirlpool', 'https://www.whirlpool.mx'],
  ['marti', 'Martí', 'https://www.marti.mx'],
  ['mobo', 'Mobo', 'https://www.mobo.com.mx'],
  ['sally', 'Sally Beauty', 'https://www.sallymexico.com'],
  ['cyberpuerta', 'Cyberpuerta', 'https://www.cyberpuerta.mx'],
];

const NAME = Object.fromEntries(STORES.map(([id, name]) => [id, name]));

let seq = 0;
function offer(storeId: string, title: string, price: number, listPrice: number | null = null, extra: Partial<Offer> = {}): Offer {
  seq += 1;
  const discountPct = listPrice && listPrice > price ? Math.round(((listPrice - price) / listPrice) * 100) : null;
  return {
    id: `${storeId}:${seq}`,
    storeId,
    storeName: NAME[storeId] ?? storeId,
    title,
    brand: 'Apple',
    price,
    listPrice: discountPct ? listPrice : null,
    discountPct,
    currency: 'MXN',
    url: `https://www.${storeId}.com.mx/p/${seq}`,
    imageUrl: null,
    rating: 4.7,
    reviews: 1200,
    seller: null,
    gtin: null,
    condition: 'nuevo',
    isAccessory: false,
    relevance: 1,
    extras: [],
    ...extra,
  };
}

function group(offers: Offer[], brand = 'Apple'): ProductGroup {
  const sorted = [...offers].sort((a, b) => a.price - b.price);
  const best = sorted[0]!;
  const maxPrice = sorted[sorted.length - 1]!.price;
  return {
    key: best.id,
    title: best.title,
    brand,
    imageUrl: best.imageUrl,
    condition: best.condition,
    best,
    offers: sorted,
    storeCount: sorted.length,
    minPrice: best.price,
    maxPrice,
    spread: Math.round((maxPrice - best.price) * 100) / 100,
    recommendation: null,
    links: [{ storeId: 'mercadolibre', storeName: 'Mercado Libre', url: 'https://listado.mercadolibre.com.mx/iphone-15', kind: 'busqueda' }],
  };
}

const runs: StoreRun[] = [
  { storeId: 'amazon', storeName: 'Amazon', status: 'ok', count: 9, ms: 1830, message: null },
  { storeId: 'liverpool', storeName: 'Liverpool', status: 'ok', count: 6, ms: 2410, message: null },
  { storeId: 'costco', storeName: 'Costco', status: 'ok', count: 2, ms: 980, message: null },
  { storeId: 'elektra', storeName: 'Elektra', status: 'ok', count: 4, ms: 1210, message: null },
  { storeId: 'chedraui', storeName: 'Chedraui', status: 'sin-resultados', count: 0, ms: 870, message: null },
  { storeId: 'officemax', storeName: 'OfficeMax', status: 'sin-resultados', count: 0, ms: 1040, message: null },
  { storeId: 'sony', storeName: 'Sony Store', status: 'sin-resultados', count: 0, ms: 690, message: null },
  { storeId: 'whirlpool', storeName: 'Whirlpool', status: 'sin-resultados', count: 0, ms: 720, message: null },
  { storeId: 'marti', storeName: 'Martí', status: 'sin-resultados', count: 0, ms: 650, message: null },
  { storeId: 'mobo', storeName: 'Mobo', status: 'ok', count: 3, ms: 1530, message: null },
  { storeId: 'sally', storeName: 'Sally Beauty', status: 'sin-resultados', count: 0, ms: 610, message: null },
  { storeId: 'cyberpuerta', storeName: 'Cyberpuerta', status: 'tiempo-agotado', count: 0, ms: 12000, message: 'La tienda tardó demasiado en responder.' },
  { storeId: 'mercadolibre', storeName: 'Mercado Libre', status: 'requiere-credenciales', count: 0, ms: 2, message: 'Faltan las llaves de la API.' },
];

export function searchFixture(query: string): SearchResponse {
  seq = 0;
  const groups = [
    group([
      offer('liverpool', 'Apple iPhone 15 128 GB Negro', 14999, 17999),
      offer('amazon', 'Apple iPhone 15 (128 GB) - Negro', 15499),
      offer('elektra', 'iPhone 15 128GB Negro Apple', 16299, 18499),
      offer('costco', 'Apple iPhone 15 128GB Negro', 16890),
      offer('mobo', 'Apple iPhone 15 128GB Negro', 17199, 17999),
    ]),
    group([
      offer('amazon', 'Apple iPhone 15 (256 GB) - Azul', 17999, 20999),
      offer('liverpool', 'Apple iPhone 15 256 GB Azul', 18499),
      offer('elektra', 'iPhone 15 256GB Azul Apple', 19199),
    ]),
    group([
      offer('costco', 'Apple iPhone 15 Pro 128GB Titanio Natural', 20990, 23999),
      offer('amazon', 'Apple iPhone 15 Pro (128 GB) - Titanio natural', 21499),
    ]),
    group([
      offer('amazon', 'Apple iPhone 15 Plus (128 GB) - Rosa', 17299),
      offer('liverpool', 'Apple iPhone 15 Plus 128 GB Rosa', 17299),
    ]),
    group([offer('mobo', 'Apple iPhone 15 512GB Verde', 22999, 25999)]),
    group([offer('amazon', 'Apple iPhone 15 (128 GB) - Amarillo (Reacondicionado)', 12990, null, { condition: 'reacondicionado' })]),
  ];
  return {
    query,
    country: 'MX',
    state: null,
    sort: 'relevancia',
    groups,
    totalOffers: groups.reduce((n, g) => n + g.offers.length, 0),
    exact: false,
    hiddenAccessories: 23,
    hiddenRefurbished: 4,
    hiddenInexact: 0,
    stores: runs,
    cached: false,
    tookMs: 2418,
    generatedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
  };
}

export function dealsFixture(): DealsResponse {
  seq = 100;
  const list: Array<[string, string, number, number]> = [
    ['elektra', 'Pantalla Samsung 55 pulgadas Crystal UHD DU7000', 7499, 12999],
    ['chedraui', 'Freidora de aire Ninja 6.5 L', 1899, 3299],
    ['officemax', 'Laptop Lenovo IdeaPad Slim 3 15 pulgadas', 8999, 13999],
    ['whirlpool', 'Lavadora Whirlpool 22 kg', 9499, 13499],
    ['marti', 'Tenis Nike Revolution 7', 999, 1499],
    ['sony', 'Audífonos Sony WH-CH520', 799, 1099],
    ['mobo', 'Cargador Mobo 20W USB-C', 199, 349],
    ['elektra', 'Refrigerador Mabe 14 pies', 8299, 11999],
    ['sally', 'Secadora de cabello Hot Tools', 699, 1199],
    ['chedraui', 'Bocina JBL Flip 6', 1799, 2799],
  ];
  const offers = list.map(([storeId, title, price, listPrice]) => offer(storeId, title, price, listPrice, { brand: null }));
  return {
    country: 'MX',
    offers: offers.sort((a, b) => (b.discountPct ?? 0) - (a.discountPct ?? 0)),
    stores: runs.filter((r) => ['elektra', 'chedraui', 'officemax', 'whirlpool', 'marti', 'sony', 'mobo', 'sally'].includes(r.storeId)),
    cached: false,
    generatedAt: new Date(Date.now() - 20 * 60_000).toISOString(),
  };
}

export const storesFixture: StoreInfo[] = [
  ...STORES.map(([id, name, homepage]): StoreInfo => ({
    id,
    name,
    country: 'MX',
    homepage,
    access: id === 'amazon' || id === 'liverpool' || id === 'cyberpuerta' ? 'pagina-web' : 'catalogo-publico',
    availability: 'activa',
    note: null,
  })),
  {
    id: 'mercadolibre',
    name: 'Mercado Libre',
    country: 'MX',
    homepage: 'https://www.mercadolibre.com.mx',
    access: 'api-oficial',
    availability: 'requiere-credenciales',
    note: 'Solo por su API oficial: hay que registrar la app y poner las llaves en el servidor.',
  },
  {
    id: 'walmart',
    name: 'Walmart',
    country: 'MX',
    homepage: 'https://www.walmart.com.mx',
    access: 'pagina-web',
    availability: 'bloqueada',
    note: 'A los lectores automáticos les responde con resultados de OTRA búsqueda, así que no es confiable.',
  },
  {
    id: 'sams',
    name: "Sam's Club",
    country: 'MX',
    homepage: 'https://www.sams.com.mx',
    access: 'pagina-web',
    availability: 'bloqueada',
    note: 'Rechaza la consulta con un muro anti-robots. Camino: convenio de afiliados o API oficial.',
  },
];

export const countriesFixture: CountryInfo[] = [
  {
    code: 'MX',
    name: 'México',
    currency: 'MXN',
    locale: 'es-MX',
    activeStores: 12,
    states: [
      { code: 'CMX', name: 'Ciudad de México' },
      { code: 'JAL', name: 'Jalisco' },
      { code: 'NLE', name: 'Nuevo León' },
      { code: 'QUE', name: 'Querétaro' },
    ],
  },
];
