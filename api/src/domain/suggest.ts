import type { Suggestion, SuggestResponse } from '../../../shared/contracts.ts';
import { type KnownModel, modelSearchText } from './models.ts';
import { normalize } from './text.ts';

/** Una búsqueda que otras personas ya hicieron en este servidor y sí trajo resultados. */
export interface LearnedTerm {
  text: string;
  hits: number;
}

export interface SuggestInput {
  query: string;
  models: readonly KnownModel[];
  learned: readonly LearnedTerm[];
  /** Cuántas sugerencias como máximo (las relacionadas van aparte). */
  limit?: number;
}

/** Palabras comparables para sugerir: minúsculas sin acentos y con letras y números separados ("s25" → "s 25"). */
export function suggestTokens(text: string): string[] {
  return normalize(text)
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .split(' ')
    .filter(Boolean);
}

/** Cada palabra escrita debe ser el inicio de alguna palabra del candidato ("iph 15 pr" → "iphone 15 pro"). */
function matchesByPrefix(queryTokens: string[], candidateTokens: string[]): boolean {
  return queryTokens.every((q) => candidateTokens.some((c) => c.startsWith(q)));
}

interface Scored {
  model: KnownModel;
  /** Qué tanto del nombre del modelo ya está escrito (0–1). 1 = el usuario escribió el modelo completo. */
  coverage: number;
  /** El texto escrito es el inicio del nombre completo o del modelo. */
  startsWith: boolean;
  tokens: string[];
  modelTokens: string[];
}

function scoreModel(model: KnownModel, queryNorm: string, queryTokens: string[]): Scored | null {
  const full = modelSearchText(model);
  const tokens = suggestTokens(full);
  if (!matchesByPrefix(queryTokens, tokens)) return null;
  const brandTokens = new Set(suggestTokens(model.brand));
  const modelTokens = tokens.filter((t) => !brandTokens.has(t));
  const covered = modelTokens.filter((c) => queryTokens.some((q) => c.startsWith(q))).length;
  const coverage = modelTokens.length === 0 ? 1 : covered / modelTokens.length;
  const startsWith = normalize(full).startsWith(queryNorm) || normalize(model.model).startsWith(queryNorm);
  return { model, coverage, startsWith, tokens, modelTokens };
}

/** El usuario ya escribió el modelo completo: cada palabra del modelo está escrita entera (o casi, 3+ letras). */
function isComplete(s: Scored, queryTokens: string[]): boolean {
  return s.modelTokens.every((c) => queryTokens.some((q) => q === c || (q.length >= 3 && c.startsWith(q))));
}

/** Modelos hermanos: misma marca y categoría, y la misma generación (mismo primer número) o la misma familia. */
export function siblingsOf(model: KnownModel, models: readonly KnownModel[]): KnownModel[] {
  const mine = suggestTokens(model.model);
  const generation = mine.find((t) => /^\d/.test(t));
  const family = mine[0];
  return models.filter((m) => {
    if (m === model || m.brand !== model.brand || m.category !== model.category) return false;
    const theirs = suggestTokens(m.model);
    if (generation) return theirs.includes(generation) && theirs[0] === family;
    return theirs[0] === family;
  });
}

const toSuggestion = (m: KnownModel, kind: Suggestion['kind'], variant?: string): Suggestion => ({
  text: modelSearchText(m, variant),
  kind,
  brand: m.brand,
  category: m.category,
});

/**
 * Sugerencias al escribir. Primero los modelos del catálogo que empiezan como lo escrito; cuando el modelo ya
 * está completo, sus variantes (128GB, 256GB…) y, aparte, los modelos hermanos para comparar. Lo que otras
 * personas buscaron rellena lo que falte. Sin red, sin base de datos: puro cálculo sobre lo que le pasan.
 */
export function suggest(input: SuggestInput): SuggestResponse {
  const limit = Math.max(1, Math.min(input.limit ?? 8, 20));
  const query = input.query.trim().replace(/\s+/g, ' ');
  const queryNorm = normalize(query);
  const queryTokens = suggestTokens(query);
  if (queryTokens.length === 0 || queryNorm.length < 2) return { query, suggestions: [], related: [] };

  const scored = input.models
    .map((m) => scoreModel(m, queryNorm, queryTokens))
    .filter((s): s is Scored => s !== null)
    .sort(
      (a, b) =>
        Number(b.startsWith) - Number(a.startsWith) ||
        b.coverage - a.coverage ||
        a.tokens.length - b.tokens.length ||
        a.model.model.localeCompare(b.model.model),
    );

  const seen = new Set<string>();
  const take = (list: Suggestion[], s: Suggestion): void => {
    const key = normalize(s.text);
    if (seen.has(key) || key === queryNorm) return;
    seen.add(key);
    list.push(s);
  };

  const suggestions: Suggestion[] = [];
  const related: Suggestion[] = [];
  const complete = scored.filter((s) => isComplete(s, queryTokens));

  // Modelo completo: sus variantes van primero (es lo que afina la comparación) y sus hermanos aparte.
  for (const s of complete.slice(0, 2)) {
    for (const v of s.model.variants) take(suggestions, toSuggestion(s.model, 'variante', v));
  }
  for (const s of scored) {
    if (suggestions.length >= limit) break;
    take(suggestions, toSuggestion(s.model, 'modelo'));
  }
  if (complete[0]) {
    const anchor = complete[0].model;
    const relatedSeen = new Set<string>([queryNorm]);
    const takeRelated = (s: Suggestion): void => {
      const key = normalize(s.text);
      if (relatedSeen.has(key)) return;
      relatedSeen.add(key);
      related.push(s);
    };
    for (const v of anchor.variants) takeRelated(toSuggestion(anchor, 'variante', v));
    for (const sib of siblingsOf(anchor, input.models)) takeRelated(toSuggestion(sib, 'modelo'));
  }

  const learned = [...input.learned]
    .filter((t) => t.hits > 0 && t.text.trim().length >= 3)
    .sort((a, b) => b.hits - a.hits)
    .filter((t) => matchesByPrefix(queryTokens, suggestTokens(t.text)));
  for (const t of learned) {
    if (suggestions.length >= limit) break;
    take(suggestions, { text: t.text.trim(), kind: 'popular', brand: null, category: null });
  }

  return { query, suggestions: suggestions.slice(0, limit), related: related.slice(0, 12) };
}
