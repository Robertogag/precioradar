/**
 * Servidor de mentira para probar la web sin internet: contesta las mismas rutas que api/ con datos de muestra.
 * Las sugerencias sí son las de verdad (usa el mismo código del servidor), así se prueba el cuadro de búsqueda.
 *
 *   node scripts/mock-api.ts          (puerto 4000; la web en desarrollo le pega sola)
 */
import { createServer } from 'node:http';
import { KNOWN_MODELS } from '../../api/src/domain/models.ts';
import { suggest } from '../../api/src/domain/suggest.ts';
import { countriesFixture, dealsFixture, searchFixture, storesFixture } from './fixtures.ts';

const port = Number(process.env.PORT ?? 4000);
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LEARNED = [
  { text: 'iphone 15 pro max 256gb', hits: 14 },
  { text: 'licuadora oster', hits: 9 },
  { text: 'pantalla 55 pulgadas', hits: 7 },
  { text: 'freidora de aire', hits: 6 },
];

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  const path = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  const q = url.searchParams.get('q') ?? '';

  const send = (status: number, body: unknown) => {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': req.headers.origin ?? '*',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(body));
  };

  try {
    if (path === '/health') return send(200, { ok: true, version: 'mock', activeStores: 12 });
    if (path === '/countries') return send(200, countriesFixture);
    if (path === '/stores') return send(200, storesFixture);
    if (path === '/suggest') return send(200, suggest({ query: q, models: KNOWN_MODELS, learned: LEARNED, limit: 8 }));
    if (path === '/deals') {
      await delay(400);
      return send(200, dealsFixture());
    }
    if (path === '/search') {
      if (q.trim().length < 2) return send(400, { error: 'peticion-invalida', message: 'Escribe al menos 2 letras.' });
      await delay(700);
      if (/^nada/i.test(q)) return send(200, { ...searchFixture(q), groups: [], totalOffers: 0, hiddenAccessories: 0, hiddenRefurbished: 0 });
      return send(200, searchFixture(q));
    }
    return send(404, { error: 'no-encontrado', message: 'No existe esa ruta.' });
  } catch (err) {
    return send(500, { error: 'error-interno', message: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Mock API en http://localhost:${port}/api/health  (datos de muestra; sugerencias reales)`);
});
