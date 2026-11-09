import { networkInterfaces } from 'node:os';
import { VERSION, compose } from './composition.ts';
import { buildServer } from './interfaces/http/server.ts';

const { service, suggester, historyService, links, observations, job, jobKey, registry, history, security, lane } = compose();
const app = await buildServer({ service, suggester, history: historyService, links, observations, job, jobKey, catalog: registry.catalog, version: VERSION, security });

const port = Number(process.env.PORT ?? 4000);
await app.listen({ host: '0.0.0.0', port });
// Chromium se abre en segundo plano al arrancar: así la primera búsqueda en una copia recién levantada no se queda sin tiempo.
lane?.warmUp();

const lan = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => `http://${n!.address}:${port}`);
console.log(
  [
    '',
    `Comparador API ${VERSION} lista.`,
    `  En esta PC:       http://localhost:${port}/health`,
    `  Desde el celular: ${lan.join('  ') || '(sin red local)'}`,
    `  App web:          ${security.webDist ? `http://localhost:${port}/` : 'no compilada (cd web && npm run build)'}`,
    `  Orígenes web:     ${security.allowedOrigins?.join(', ') ?? 'desarrollo (localhost y red local)'}`,
    '',
  ].join('\n'),
);

// Cloud Run manda SIGTERM antes de apagar la copia: se cierra el servidor y la base con orden.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    void app
      .close()
      .then(() => Promise.all([history.close(), lane?.close()]))
      .finally(() => process.exit(0));
  });
}
