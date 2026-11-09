import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { type Browser, type BrowserContext, chromium } from 'playwright-core';
import { StoreBlockedError } from '../../application/ports.ts';

/**
 * Carril de navegador: para tiendas cuya página de resultados se arma dentro del navegador (Coppel, Sears) y no
 * exponen un catálogo consultable con una petición simple. Se abre la página pública como lo haría una persona
 * (Chromium real, sin disfraces, sin proxies) y se lee la respuesta JSON que la propia página pide.
 * Política igual que el cliente HTTP: si la tienda contesta con un muro (401/403/429/503) se reporta BLOQUEADA y no
 * se insiste ni se intenta brincar. Un solo Chromium por copia del servidor, pocas pestañas a la vez, sin imágenes.
 */

export interface CaptureOptions {
  signal: AbortSignal;
  /** Espera máxima total (navegar + que la página pida sus datos). */
  timeoutMs: number;
  /** Qué respuesta de la página nos interesa (por su dirección). */
  match: RegExp;
  /** Tamaño mínimo para considerarla la buena (las primeras suelen ser vacías). */
  minBytes?: number;
}

export interface BrowserLane {
  capture(url: string, options: CaptureOptions): Promise<string>;
  /** Abre Chromium desde ya (tarda unos segundos) para que la primera búsqueda no lo pague. */
  warmUp(): void;
  close(): Promise<void>;
}

/** Dónde está Chromium: la variable PLAYWRIGHT_CHROMIUM, el que trae la imagen de Playwright, o la caché local de Playwright. */
export function findChromium(): string | null {
  const fromEnv = process.env.PLAYWRIGHT_CHROMIUM?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  try {
    const bundled = chromium.executablePath();
    if (bundled && existsSync(bundled)) return bundled;
  } catch {
    /* sin navegador instalado por Playwright */
  }
  const local = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : null;
  if (local && existsSync(local)) {
    const dir = readdirSync(local)
      .filter((d) => /^chromium-\d+$/.test(d))
      .sort()
      .pop();
    if (dir) {
      for (const sub of ['chrome-win64', 'chrome-win', 'chrome-linux']) {
        const exe = join(local, dir, sub, process.platform === 'win32' ? 'chrome.exe' : 'chrome');
        if (existsSync(exe)) return exe;
      }
    }
  }
  return null;
}

const WALL = new Set([401, 403, 407, 429, 503]);

export function createBrowserLane(opts: { executablePath: string; concurrency?: number; log?: (message: string) => void }): BrowserLane {
  const max = opts.concurrency ?? 2;
  let browser: Promise<Browser> | null = null;
  let active = 0;
  const waiting: (() => void)[] = [];
  const acquire = () =>
    new Promise<void>((resolve) => {
      const go = () => {
        active++;
        resolve();
      };
      if (active < max) go();
      else waiting.push(go);
    });
  const release = () => {
    active--;
    waiting.shift()?.();
  };

  function getBrowser(): Promise<Browser> {
    if (!browser) {
      opts.log?.('navegador: abriendo Chromium');
      browser = chromium
        .launch({ executablePath: opts.executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] })
        .then((b) => {
          b.on('disconnected', () => {
            browser = null;
          });
          return b;
        })
        .catch((err: unknown) => {
          browser = null;
          throw err;
        });
    }
    return browser;
  }

  async function capture(url: string, { signal, timeoutMs, match, minBytes = 1000 }: CaptureOptions): Promise<string> {
    await acquire();
    let context: BrowserContext | null = null;
    try {
      const b = await getBrowser();
      context = await b.newContext({ locale: 'es-MX', viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      // Sin imágenes, tipografías ni video: no hacen falta para leer el JSON y ahorran tiempo y datos a la tienda.
      await page.route('**/*', (route) => (['image', 'font', 'media'].includes(route.request().resourceType()) ? route.abort() : route.continue()));

      const found = new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(Object.assign(new Error('La tienda no entregó resultados a tiempo.'), { name: 'TimeoutError' })), timeoutMs);
        const done = (fn: () => void) => {
          clearTimeout(timer);
          signal.removeEventListener('abort', onAbort);
          fn();
        };
        const onAbort = () => done(() => reject(signal.reason instanceof Error ? signal.reason : Object.assign(new Error('Cancelado'), { name: 'AbortError' })));
        signal.addEventListener('abort', onAbort, { once: true });
        page.on('response', (res) => {
          if (res.status() !== 200 || !match.test(res.url())) return;
          res
            .text()
            .then((text) => {
              if (text.length >= minBytes) done(() => resolve(text));
            })
            .catch(() => {});
        });
      });

      const navigation = page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).then((res) => {
        if (res && WALL.has(res.status())) throw new StoreBlockedError(`La tienda respondió ${res.status()} al navegador.`);
      });
      // Si la navegación choca con un muro, eso gana; si no, se espera la respuesta que buscamos.
      return await Promise.race([found, navigation.then(() => found)]);
    } finally {
      await context?.close().catch(() => {});
      release();
    }
  }

  async function close(): Promise<void> {
    const b = await browser?.catch(() => null);
    await b?.close().catch(() => {});
    browser = null;
  }

  function warmUp(): void {
    getBrowser().catch((err: unknown) => opts.log?.(`navegador: no se pudo abrir Chromium: ${err instanceof Error ? err.message : String(err)}`));
  }

  return { capture, warmUp, close };
}
