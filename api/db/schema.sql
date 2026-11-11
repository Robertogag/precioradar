-- Comparador de precios · memoria del servidor (Postgres 14+ / Cloud SQL).
-- Idempotente: el servidor lo corre en cada arranque; crear lo que falte y no tocar lo que ya existe.

CREATE SCHEMA IF NOT EXISTS comparador;

-- Cada búsqueda que alguna tienda sí contestó: qué busca la gente y cuánto encontró.
CREATE TABLE IF NOT EXISTS comparador.searches (
  id            bigserial    PRIMARY KEY,
  country       text         NOT NULL,
  query         text         NOT NULL,
  query_norm    text         NOT NULL,
  result_count  integer      NOT NULL,
  store_count   integer      NOT NULL,
  searched_at   timestamptz  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS searches_country_time ON comparador.searches (country, searched_at DESC);

-- Términos aprendidos: lo que la gente escribe y sí encuentra. Alimenta las sugerencias al escribir.
CREATE TABLE IF NOT EXISTS comparador.terms (
  country    text         NOT NULL,
  term_norm  text         NOT NULL,
  term       text         NOT NULL,
  hits       integer      NOT NULL DEFAULT 1,
  last_at    timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (country, term_norm)
);
CREATE INDEX IF NOT EXISTS terms_prefix ON comparador.terms (country, term_norm text_pattern_ops);

-- Precios vistos en cada búsqueda: la base del historial de precios y de las alertas que vienen después.
CREATE TABLE IF NOT EXISTS comparador.price_snapshots (
  id           bigserial      PRIMARY KEY,
  country      text           NOT NULL,
  store_id     text           NOT NULL,
  external_id  text           NOT NULL,
  title        text           NOT NULL,
  brand        text,
  price        numeric(12,2)  NOT NULL,
  list_price   numeric(12,2),
  currency     text           NOT NULL,
  url          text           NOT NULL,
  seen_at      timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS price_snapshots_item ON comparador.price_snapshots (store_id, external_id, seen_at DESC);
-- De dónde salió el precio: 'tienda' (lo leyó el servidor) o 'usuario' (lo vio una persona en la app al abrir la página).
ALTER TABLE comparador.price_snapshots ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'tienda';

-- Para el historial por periodo y la cobertura (desde cuándo hay datos).
CREATE INDEX IF NOT EXISTS price_snapshots_country_time ON comparador.price_snapshots (country, seen_at);

-- Reporte de uso (11-nov-2026). Quién buscó: 'persona' o 'refresco' (el trabajo automático de las 6:00); si la
-- respuesta salió de caché (alguien buscó lo mismo hace poco); y un código de visitante que cambia cada día y no
-- permite saber la IP ni seguir a nadie de un día a otro.
ALTER TABLE comparador.searches ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'persona';
ALTER TABLE comparador.searches ADD COLUMN IF NOT EXISTS from_cache boolean NOT NULL DEFAULT false;
ALTER TABLE comparador.searches ADD COLUMN IF NOT EXISTS visitor text;
-- Antes de esta fecha no se distinguía el refresco: sus búsquedas son las que caen entre 6:00 y 6:30 (hora de México).
UPDATE comparador.searches SET origin = 'refresco'
 WHERE origin = 'persona' AND searched_at < '2026-11-12'
   AND (searched_at AT TIME ZONE 'America/Mexico_City')::time BETWEEN '05:59' AND '06:30';

-- Cómo le va a cada tienda, por día: veces que contestó con resultados, sin resultados o con falla, y cuánto tardó.
CREATE TABLE IF NOT EXISTS comparador.store_daily (
  country   text     NOT NULL,
  day       date     NOT NULL,
  store_id  text     NOT NULL,
  status    text     NOT NULL,
  runs      integer  NOT NULL DEFAULT 0,
  total_ms  bigint   NOT NULL DEFAULT 0,
  PRIMARY KEY (country, day, store_id, status)
);
