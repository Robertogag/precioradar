/**
 * Capturas de la web para revisarla con los ojos (escritorio y teléfono, español e inglés).
 * Necesita la web sirviéndose (vite preview o dev) y el mock o la API real detrás.
 *
 *   node scripts/screens.ts                    → http://localhost:4173, salida en release/screens/
 *   BASE=http://localhost:5173 node scripts/screens.ts
 *
 * Usa el Playwright que ya está instalado en otro proyecto de esta PC (PLAYWRIGHT_DIR) para no instalar nada.
 */
/// <reference lib="dom" />
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const BASE = (process.env.BASE ?? 'http://localhost:4173').replace(/\/+$/, '');
const OUT = new URL('../release/screens/', import.meta.url);
const PW = process.env.PLAYWRIGHT_DIR ?? 'A:/kiosk-app/node_modules/playwright/index.mjs';

mkdirSync(OUT, { recursive: true });
const playwright = await import(pathToFileURL(PW).href);
const browser = await playwright.chromium.launch();

const VIEWS = [
  { tag: 'desktop', width: 1440, height: 900 },
  { tag: 'phone', width: 412, height: 915, mobile: true },
];

type Shot = { name: string; path: string; lang?: 'es' | 'en'; act?: (page: any) => Promise<void> };

const SHOTS: Shot[] = [
  { name: 'inicio', path: '/' },
  { name: 'inicio-en', path: '/', lang: 'en' },
  {
    name: 'sugerencias',
    path: '/',
    act: async (page) => {
      await page.getByRole('combobox').fill('iphone 15');
      await page.waitForSelector('[role=listbox]');
      await page.waitForTimeout(400);
    },
  },
  { name: 'resultados', path: '/buscar?q=iphone+15', act: (page) => page.waitForSelector('.card:not(.sk)') },
  { name: 'resultados-en', path: '/buscar?q=iphone+15&orden=precio', lang: 'en', act: (page) => page.waitForSelector('.card:not(.sk)') },
  {
    name: 'resultados-filtros',
    path: '/buscar?q=iphone+15&tiendas=amazon,liverpool&desc=1',
    act: async (page) => {
      await page.waitForSelector('.card:not(.sk)');
      const btn = page.locator('.results__filters');
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(300);
      }
    },
  },
  { name: 'sin-resultados', path: '/buscar?q=nada+de+nada', act: (page) => page.waitForSelector('.state') },
  { name: 'descuentos', path: '/descuentos', act: (page) => page.waitForSelector('.deal') },
  { name: 'tiendas', path: '/tiendas', act: (page) => page.waitForSelector('.store') },
  { name: 'ajustes', path: '/ajustes', act: (page) => page.waitForSelector('.select') },
];

for (const view of VIEWS) {
  for (const shot of SHOTS) {
    const context = await browser.newContext({
      viewport: { width: view.width, height: view.height },
      deviceScaleFactor: 1,
      isMobile: view.mobile ?? false,
      hasTouch: view.mobile ?? false,
      locale: shot.lang === 'en' ? 'en-US' : 'es-MX',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (e: Error) => errors.push(e.message));
    page.on('console', (m: any) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.goto(`${BASE}${shot.path}`, { waitUntil: 'networkidle' });
    if (shot.lang === 'en') {
      await page.getByRole('button', { name: 'EN', exact: true }).click();
      await page.waitForTimeout(200);
    }
    if (shot.act) await shot.act(page);
    await page.waitForTimeout(250);
    const file = new URL(`${shot.name}.${view.tag}.png`, OUT);
    await page.screenshot({ path: file, fullPage: !shot.act || shot.name !== 'sugerencias' });
    const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    console.log(`${shot.name}.${view.tag}  ${scrollX > 0 ? `SCROLL HORIZONTAL ${scrollX}px` : 'ok'}${errors.length ? `  ERRORES: ${errors.join(' | ')}` : ''}`);
    await context.close();
  }
}

await browser.close();
console.log(`Capturas en ${OUT.pathname}`);
