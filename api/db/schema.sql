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
