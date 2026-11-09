import type { StoreInfo } from '../../../../shared/contracts.ts';
import type { StoreAdapter, StoreLinker } from '../../application/ports.ts';
import type { BrowserLane } from '../browser/browserLane.ts';
import type { HttpGet } from '../http/httpClient.ts';
import { createAmazonStore } from './amazon.ts';
import { createCoppelStore } from './coppel.ts';
import { createCostcoStore } from './costco.ts';
import { createCyberpuertaStore } from './cyberpuerta.ts';
import { createHomeDepotStore } from './homedepot.ts';
import { createLiverpoolStore, createSuburbiaStore } from './liverpool.ts';
import { createMagentoStore } from './magento.ts';
import { createMeliAuth, createMercadoLibreLinker, createMercadoLibreStore, type MeliCredentials } from './mercadolibre.ts';
import { createOfficeDepotStore } from './officedepot.ts';
import { createSearsStore } from './sears.ts';
import { createShopifyStore } from './shopify.ts';
import { createVtexStore, type VtexStoreConfig } from './vtex.ts';
import { createWooCommerceStore } from './woocommerce.ts';

/** Tiendas VTEX de México con catálogo público comprobado el 6-nov-2026. Agregar otra = agregar un renglón. */
const VTEX_STORES: VtexStoreConfig[] = [
  { id: 'elektra', name: 'Elektra', host: 'www.elektra.mx' },
  { id: 'chedraui', name: 'Chedraui', host: 'www.chedraui.com.mx' },
  { id: 'officemax', name: 'OfficeMax', host: 'www.officemax.com.mx' },
  { id: 'sony', name: 'Sony Store', host: 'store.sony.com.mx' },
  { id: 'whirlpool', name: 'Whirlpool', host: 'www.whirlpool.mx' },
  { id: 'marti', name: 'Martí', host: 'www.marti.mx' },
  { id: 'mobo', name: 'Mobo', host: 'www.mobo.com.mx' },
  { id: 'sally', name: 'Sally Beauty', host: 'www.sallymexico.com' },
  // Comprobado el 8-nov-2026 (sondeo de tiendas faltantes): iShop (Mixup) contesta el catálogo VTEX.
  { id: 'ishop', name: 'iShop', host: 'www.ishopmixup.com' },
];

const pending = (id: string, name: string, homepage: string, note: string): StoreInfo => ({
  id,
  name,
  country: 'MX',
  homepage,
  access: 'pagina-web',
  availability: 'bloqueada',
  note,
});

const DECOY = 'A los lectores automáticos les responde con resultados de OTRA búsqueda (comprobado 6-nov-2026), así que no es confiable. Camino: convenio de afiliados o leerla desde el teléfono del usuario.';
const WALL = 'Rechaza la consulta con un muro anti-robots (comprobado 6-nov-2026). Camino: convenio de afiliados o API oficial.';
const INTERNAL = 'La página no trae los productos; salen de un servicio interno de la tienda que no se consulta. Camino: convenio de afiliados.';
const BROWSER_ONLY = 'Su página de resultados se arma dentro del navegador. Se lee con el carril de navegador cuando el servidor tiene Chromium (comprobado 8-nov-2026).';

/** Tiendas que el usuario pidió o esperaría ver y que HOY no se consultan, con la razón. La app las enseña tal cual. */
const PENDING_STORES: StoreInfo[] = [
  pending('walmart', 'Walmart', 'https://www.walmart.com.mx', DECOY),
  pending('bodega', 'Bodega Aurrerá', 'https://www.bodegaaurrera.com.mx', DECOY),
  pending('sams', "Sam's Club", 'https://www.sams.com.mx', WALL),
  pending('sears', 'Sears', 'https://www.sears.com.mx', BROWSER_ONLY),
  pending('sanborns', 'Sanborns', 'https://www.sanborns.com.mx', INTERNAL),
  pending('claroshop', 'Claro Shop', 'https://www.claroshop.com', INTERNAL),
  pending('soriana', 'Soriana', 'https://www.soriana.com', WALL),
  pending('palacio', 'El Palacio de Hierro', 'https://www.elpalaciodehierro.com', WALL),
  pending('heb', 'H-E-B', 'https://www.heb.com.mx', WALL),
  pending('coppel', 'Coppel', 'https://www.coppel.com', BROWSER_ONLY),
];

export interface StoreRegistry {
  adapters: StoreAdapter[];
  /** Todas las tiendas conocidas, activas o no, para enseñarlas en la app. */
  catalog: StoreInfo[];
  /** Tiendas que no se consultan pero sí se enlazan desde cada producto (su buscador o la página del producto). */
  linkers: StoreLinker[];
}

export interface RegistryHttp {
  /** Petición simple (la mayoría de las tiendas). */
  plain: HttpGet;
  /** Sigue redirecciones guardando cookies (Suburbia). */
  withCookies: HttpGet;
}

export function buildRegistry(http: HttpGet | RegistryHttp, meli: MeliCredentials, lane: BrowserLane | null = null): StoreRegistry {
  const clients: RegistryHttp = typeof http === 'function' ? { plain: http, withCookies: http } : http;
  const meliAuth = createMeliAuth(meli);
  const adapters: StoreAdapter[] = [
    createMercadoLibreStore(meli, meliAuth),
    createAmazonStore(clients.plain),
    createLiverpoolStore(clients.plain),
    createSuburbiaStore(clients.withCookies),
    createCostcoStore(clients.plain),
    createHomeDepotStore(clients.plain),
    createOfficeDepotStore(clients.plain),
    ...VTEX_STORES.map((s) => createVtexStore(s, clients.plain)),
    createCyberpuertaStore(clients.plain),
    // Sondeo del 8-nov-2026 de tiendas que faltaban: estas tres exponen catálogo público en plataformas conocidas.
    createShopifyStore({ id: 'doto', name: 'Doto', host: 'www.doto.com.mx' }, clients.plain),
    createMagentoStore({ id: 'steren', name: 'Steren', host: 'www.steren.com.mx' }, clients.plain),
    createWooCommerceStore({ id: 'gameplanet', name: 'Game Planet', host: 'www.gameplanet.com' }, clients.plain),
    // Carril de navegador (solo si el servidor tiene Chromium): páginas públicas que se arman dentro del navegador.
    ...(lane ? [createCoppelStore(lane), createSearsStore(lane)] : []),
  ];
  const active = new Set(adapters.map((a) => a.info.id));
  return {
    adapters,
    catalog: [...adapters.map((a) => a.info), ...PENDING_STORES.filter((s) => !active.has(s.id))],
    linkers: [createMercadoLibreLinker(meli, meliAuth)],
  };
}
