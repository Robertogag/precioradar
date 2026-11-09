import react from '@vitejs/plugin-react';
import { type Plugin, loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/**
 * Política de contenido de la página, solo en el build (en desarrollo Vite inyecta código en línea para la
 * recarga en caliente). Es la misma que manda el servidor en la cabecera; aquí va por si la web se sirve
 * desde otro lado (un CDN, un bucket). `connect` es el origen de la API cuando no es el mismo de la página.
 */
function contentSecurityPolicy(connect: string): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data:",
    "font-src 'self' data:",
    `connect-src 'self'${connect ? ` ${connect}` : ''}`,
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
  return {
    name: 'comparador-csp',
    apply: 'build',
    transformIndexHtml: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: policy }, injectTo: 'head-prepend' }],
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const apiOrigin = env.VITE_API_URL ? new URL(env.VITE_API_URL).origin : '';
  return {
    plugins: [react(), contentSecurityPolicy(apiOrigin)],
    server: {
      port: 5173,
      // En desarrollo la web llama a /api y Vite lo pasa al servidor (api/, puerto 4000).
      proxy: { '/api': { target: env.VITE_DEV_API || 'http://localhost:4000', changeOrigin: true } },
      fs: { allow: ['..'] },
    },
    preview: { port: 4173 },
    build: { target: 'es2022', sourcemap: false },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  };
});
