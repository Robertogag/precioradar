import type { StoreLink, StoreLinksResponse } from '../../../shared/contracts.ts';
import { normalize } from '../domain/text.ts';
import type { Cache, StoreLinker } from './ports.ts';

export interface LinksDeps {
  linkers: StoreLinker[];
  cache: Cache;
  /** Espera máxima por tienda al buscar la página del producto; pasado ese tiempo se da el buscador. */
  timeoutMs: number;
  /** Cuántas consultas a la vez en total, para no agotar la cuota que da la tienda a la aplicación. */
  concurrency: number;
  /** Cuánto se recuerda un enlace encontrado y cuánto uno no encontrado (o fallido). */
  hitTtlMs: number;
  missTtlMs: number;
  onError?: (storeId: string, err: unknown) => void;
}

/**
 * Enlaces a tiendas que no se consultan: el buscador de la tienda de inmediato (sin red) y, aparte, la página
 * exacta del producto si la tienda lo reconoce. Nunca falla: si la tienda no contesta, queda el buscador.
 */
export function createLinksService(deps: LinksDeps) {
  // Semáforo: a lo más `concurrency` consultas en vuelo; las demás esperan su turno.
  let active = 0;
  const waiting: (() => void)[] = [];
  const acquire = () =>
    new Promise<void>((resolve) => {
      const go = () => {
        active++;
        resolve();
      };
      if (active < deps.concurrency) go();
      else waiting.push(go);
    });
  const release = () => {
    active--;
    waiting.shift()?.();
  };

  const linkersOf = (country: string) => deps.linkers.filter((l) => l.country === country);
  const asSearch = (l: StoreLinker, title: string): StoreLink => ({ storeId: l.storeId, storeName: l.storeName, url: l.searchUrl(title), kind: 'busqueda' });
  const asProduct = (l: StoreLinker, url: string): StoreLink => ({ storeId: l.storeId, storeName: l.storeName, url, kind: 'producto' });

  /** Los buscadores de todas las tiendas enlazables del país. Síncrono: va dentro de cada grupo de la búsqueda. */
  function searchLinks(country: string, title: string): StoreLink[] {
    return linkersOf(country).map((l) => asSearch(l, title));
  }

  async function resolveOne(l: StoreLinker, title: string, brand: string | null): Promise<StoreLink> {
    const key = `link:${l.country}:${l.storeId}:${normalize(title)}`;
    const cached = deps.cache.get<string | null>(key);
    if (cached !== undefined) return cached ? asProduct(l, cached) : asSearch(l, title);

    await acquire();
    let url: string | null = null;
    try {
      const signal = AbortSignal.timeout(deps.timeoutMs);
      // La espera se impone aquí, no se confía en que el adaptador respete la señal.
      url = await new Promise<string | null>((resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        l.productUrl(title, brand, signal).then(resolve, reject);
      });
    } catch (err) {
      deps.onError?.(l.storeId, err);
    } finally {
      release();
    }
    deps.cache.set(key, url, url ? deps.hitTtlMs : deps.missTtlMs);
    return url ? asProduct(l, url) : asSearch(l, title);
  }

  /** La página del producto en cada tienda enlazable si la reconoce; si no, su buscador. */
  async function resolve(country: string, title: string, brand: string | null): Promise<StoreLinksResponse> {
    const links = await Promise.all(linkersOf(country).map((l) => resolveOne(l, title, brand)));
    return { country, title, links };
  }

  return { searchLinks, resolve };
}

export type LinksService = ReturnType<typeof createLinksService>;
