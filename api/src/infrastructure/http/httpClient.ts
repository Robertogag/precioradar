import { StoreBlockedError } from '../../application/ports.ts';

/**
 * Cliente HTTP único para todas las tiendas.
 * Política: una petición por búsqueda, con espera máxima, y si la tienda responde con un muro anti-robots
 * se reporta como BLOQUEADA y no se insiste ni se intenta brincar. Para esas tiendas el camino es su API
 * oficial o su programa de afiliados.
 */

const DEFAULT_UA =
  process.env.HTTP_USER_AGENT ??
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const BLOCK_STATUS = new Set([401, 403, 407, 429, 503]);
const BLOCK_URL = /\/blocked\b|account-verification|\/captcha|\/errors\/validateCaptcha|challenge/i;

export interface HttpOptions {
  accept: 'json' | 'html';
  signal: AbortSignal;
  headers?: Record<string, string>;
}

export interface HttpResult {
  status: number;
  url: string;
  body: string;
}

export type HttpGet = (url: string, options: HttpOptions) => Promise<HttpResult>;

function headersFor(options: HttpOptions): Record<string, string> {
  return {
    'User-Agent': DEFAULT_UA,
    Accept:
      options.accept === 'json'
        ? 'application/json, text/plain, */*'
        : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-MX,es;q=0.9,en;q=0.8',
    ...options.headers,
  };
}

/** Aplica la política de bloqueo a una respuesta final. */
function finish(status: number, url: string, body: string): HttpResult {
  if (BLOCK_STATUS.has(status) || BLOCK_URL.test(url)) {
    throw new StoreBlockedError(`La tienda rechazó la consulta (HTTP ${status}).`);
  }
  if ((status < 200 || status >= 300) && status !== 206) {
    throw new Error(`HTTP ${status}`);
  }
  return { status, url, body };
}

export const httpGet: HttpGet = async (url, options) => {
  const res = await fetch(url, { redirect: 'follow', signal: options.signal, headers: headersFor(options) });
  return finish(res.status, res.url, await res.text());
};

/**
 * Igual que httpGet, pero sigue las redirecciones guardando cookies, como lo hace un navegador.
 * Algunas tiendas (Suburbia) pasan por un inicio de sesión anónimo antes de servir la página; sin cookies
 * el ciclo nunca termina. No es un rodeo a nada: es el camino normal de cualquier visitante.
 */
export const httpGetWithCookies: HttpGet = async (url, options) => {
  const jar = new Map<string, string>();
  let current = url;
  for (let hop = 0; hop < 10; hop++) {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const res = await fetch(current, {
      redirect: 'manual',
      signal: options.signal,
      headers: { ...headersFor(options), ...(cookie ? { Cookie: cookie } : {}) },
    });
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(';')[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
    }
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.arrayBuffer().catch(() => undefined);
      current = new URL(location, current).toString();
      continue;
    }
    return finish(res.status, current, await res.text());
  }
  throw new StoreBlockedError('La tienda redirige sin fin.');
};

export function parseJson<T>(body: string): T {
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new StoreBlockedError('La tienda no devolvió datos legibles (probable muro anti-robots).');
  }
}
