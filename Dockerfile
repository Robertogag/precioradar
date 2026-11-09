# syntax=docker/dockerfile:1
# Imagen única para Cloud Run: el servidor (api/) sirve también la web compilada (web/dist).
# Node 22.18+ ejecuta TypeScript directamente (type stripping), así que no hace falta compilar la API.

# ---- 1) Web: compilar con Vite (incluye su typecheck) --------------------------------------------
FROM node:22-alpine AS web
WORKDIR /src/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY shared /src/shared
COPY web ./
RUN npm run build

# ---- 2) API: solo dependencias de producción -----------------------------------------------------
FROM node:22-alpine AS api-deps
WORKDIR /app/api
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---- 3) Imagen final --------------------------------------------------------------------------------
# La imagen oficial de Playwright trae Node 22 y Chromium con todas sus librerías: es el "carril de navegador"
# con el que se leen Coppel y Sears (páginas públicas que se arman dentro del navegador). La versión debe ser
# la misma que playwright-core en api/package.json.
FROM mcr.microsoft.com/playwright:v1.65.0-noble
ENV NODE_ENV=production \
    PORT=8080 \
    WEB_DIST=/app/web/dist \
    TRUST_PROXY=1
WORKDIR /app/api
COPY --from=api-deps --chown=pwuser:pwuser /app/api/node_modules ./node_modules
COPY --chown=pwuser:pwuser api/package.json ./
COPY --chown=pwuser:pwuser api/src ./src
COPY --chown=pwuser:pwuser api/db ./db
COPY --from=web --chown=pwuser:pwuser /src/web/dist /app/web/dist
USER pwuser
EXPOSE 8080
CMD ["node", "src/main.ts"]
