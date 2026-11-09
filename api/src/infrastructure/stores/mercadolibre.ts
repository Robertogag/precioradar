import type { StoreInfo } from '../../../../shared/contracts.ts';
import type { SearchContext, StoreAdapter, StoreLinker } from '../../application/ports.ts';
import { StoreBlockedError, StoreCredentialsError } from '../../application/ports.ts';
import { type CatalogCandidate, pickCatalogMatch, searchSlug } from '../../domain/links.ts';
import type { RawOffer } from '../../domain/offer.ts';
import { normalize } from '../../domain/text.ts';
import { parseJson } from '../http/httpClient.ts';

const API = 'https://api.mercadolibre.com';
const SITE = 'https://www.mercadolibre.com.mx';
const LISTING = 'https://listado.mercadolibre.com.mx';

interface MeliResult {
  id: string;
  title: string;
  price: number;
  original_price?: number | null;
  currency_id?: string;
  permalink: string;
  thumbnail?: string;
  condition?: string;
  seller?: { nickname?: string };
  attributes?: { id: string; value_name?: string | null }[];
}
interface MeliSearch {
  results?: MeliResult[];
}

export function parseMeliSearch(body: string): RawOffer[] {
  const data = parseJson<MeliSearch>(body);
  return (data.results ?? []).map((r) => ({
    externalId: r.id,
    title: r.title,
    brand: r.attributes?.find((a) => a.id === 'BRAND')?.value_name ?? null,
    price: r.price,
    listPrice: r.original_price ?? null,
    currency: r.currency_id,
    url: r.permalink,
    imageUrl: r.thumbnail?.replace(/^http:/, 'https:').replace(/-I\.jpg$/, '-O.jpg') ?? null,
    seller: r.seller?.nickname ?? null,
    gtin: r.attributes?.find((a) => a.id === 'GTIN')?.value_name ?? null,
    condition: r.condition === 'new' || !r.condition ? 'nuevo' : 'reacondicionado',
  }));
}

interface MeliCatalog {
  results?: { id?: string; name?: string; status?: string }[];
}

/** Productos del catálogo de Mercado Libre (vienen sin precio): id y nombre de los activos. */
export function parseMeliCatalog(body: string): CatalogCandidate[] {
  const data = parseJson<MeliCatalog>(body);
  return (data.results ?? [])
    .filter((r): r is { id: string; name: string; status?: string } => Boolean(r.id && r.name) && (r.status ?? 'active') === 'active')
    .map((r) => ({ id: r.id, name: r.name }));
}

export interface MeliCredentials {
  clientId: string | undefined;
  clientSecret: string | undefined;
}

/** Token de aplicación (client credentials), compartido por el buscador y el enlazador; se renueva solo antes de vencer. */
export function createMeliAuth(creds: MeliCredentials) {
  const configured = Boolean(creds.clientId && creds.clientSecret);
  let token: { value: string; expiresAt: number } | null = null;

  async function accessToken(signal: AbortSignal): Promise<string> {
    if (token && token.expiresAt > Date.now() + 60_000) return token.value;
    const res = await fetch(`${API}/oauth/token`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId!,
        client_secret: creds.clientSecret!,
      }),
    });
    if (!res.ok) throw new StoreCredentialsError(`Mercado Libre rechazó las llaves (HTTP ${res.status}).`);
    const data = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
    return token.value;
  }

  return { configured, accessToken };
}
export type MeliAuth = ReturnType<typeof createMeliAuth>;

/**
 * Mercado Libre: SOLO por su API oficial. Su página y su API sin llave rechazan a los lectores automáticos
 * (comprobado el 6-nov-2026: 403 y redirección a "verificación de cuenta"), y no se intenta brincar eso.
 * Hace falta registrar la aplicación en developers.mercadolibre.com.mx y poner MELI_CLIENT_ID / MELI_CLIENT_SECRET en api/.env.
 * Probado el 8-nov-2026 con la app "PrecioRadar MX": el token sale bien, pero Mercado Libre contesta 403 a la búsqueda
 * para aplicaciones externas (ver `search`). Mientras no la reabran, esta tienda aparece como bloqueada con ese motivo
 * y el usuario llega a ella por el enlace que arma `createMercadoLibreLinker`.
 */
export function createMercadoLibreStore(creds: MeliCredentials, auth: MeliAuth = createMeliAuth(creds)): StoreAdapter {
  const info: StoreInfo = {
    id: 'mercadolibre',
    name: 'Mercado Libre',
    country: 'MX',
    homepage: SITE,
    access: 'api-oficial',
    // Con llaves se anuncia como bloqueada (y no activa) porque hoy Mercado Libre contesta 403: así la lista de tiendas
    // dice la verdad. El adaptador sigue consultando en cada búsqueda; si reabren el acceso, los precios aparecen solos.
    availability: auth.configured ? 'bloqueada' : 'requiere-credenciales',
    note: auth.configured
      ? 'Mercado Libre no entrega precios a aplicaciones externas (su búsqueda contesta 403 desde finales de 2025), aunque la app está registrada y las llaves son válidas. Cada producto trae un enlace para verlo en Mercado Libre, y los precios que las personas ven al abrirlo desde la app se guardan y se enseñan a todos con su fecha.'
      : 'Falta registrar la app en Mercado Libre Developers y poner las llaves (MELI_CLIENT_ID y MELI_CLIENT_SECRET) en el servidor.',
  };

  return {
    info,
    currency: 'MXN',
    async search(query: string, ctx: SearchContext) {
      if (!auth.configured) throw new StoreCredentialsError(info.note!);
      const bearer = await auth.accessToken(ctx.signal);
      const res = await fetch(`${API}/sites/MLM/search?q=${encodeURIComponent(query)}&limit=${Math.min(ctx.limit, 50)}`, {
        signal: ctx.signal,
        headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
      });
      if (res.status === 401 || res.status === 403) {
        // Comprobado el 8-nov-2026 con llaves válidas: la búsqueda por palabra (/sites/MLM/search) contesta 403 en todas
        // sus variantes y el catálogo (/products) viene sin precio ni vendedor. Es una restricción de Mercado Libre a las
        // aplicaciones de terceros desde finales de 2025, no un problema de las llaves. Se sigue intentando por si la reabren.
        throw new StoreBlockedError(
          `Mercado Libre no entrega precios a aplicaciones externas (HTTP ${res.status}); la app está registrada y las llaves son válidas.`,
        );
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseMeliSearch(await res.text());
    },
  };
}

/**
 * Enlace a Mercado Libre para un producto. Su catálogo (/products/search) SÍ contesta a la aplicación, aunque sin
 * precios: sirve para reconocer el producto y mandar al usuario a su página exacta (mercadolibre.com.mx/p/MLM…),
 * donde Mercado Libre le enseña el precio. Si no lo reconoce, o no hay llaves, queda su buscador por nombre.
 */
export function createMercadoLibreLinker(creds: MeliCredentials, auth: MeliAuth = createMeliAuth(creds)): StoreLinker {
  return {
    storeId: 'mercadolibre',
    storeName: 'Mercado Libre',
    country: 'MX',
    searchUrl(title: string): string {
      const slug = searchSlug(title);
      return slug ? `${LISTING}/${slug}` : SITE;
    },
    async productUrl(title: string, brand: string | null, signal: AbortSignal): Promise<string | null> {
      if (!auth.configured) return null;
      const bearer = await auth.accessToken(signal);
      const q = brand && !normalize(title).includes(normalize(brand)) ? `${brand} ${title}` : title;
      const res = await fetch(`${API}/products/search?status=active&site_id=MLM&q=${encodeURIComponent(q)}&limit=8`, {
        signal,
        headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
      });
      if (!res.ok) return null;
      const match = pickCatalogMatch(parseMeliCatalog(await res.text()), title);
      return match ? `${SITE}/p/${match.id}` : null;
    },
  };
}
