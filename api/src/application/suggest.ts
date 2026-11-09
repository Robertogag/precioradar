import type { SuggestResponse } from '../../../shared/contracts.ts';
import type { KnownModel } from '../domain/models.ts';
import { type LearnedTerm, suggest, suggestTokens } from '../domain/suggest.ts';
import type { Cache, SearchHistory } from './ports.ts';

export interface SuggestDeps {
  models: readonly KnownModel[];
  history: SearchHistory;
  cache: Cache;
  /** Cuánto se reutiliza la lista de términos aprendidos antes de volver a preguntarle a la base. */
  learnedTtlMs: number;
  onHistoryError?: (err: unknown) => void;
}

/**
 * Caso de uso: sugerir mientras el usuario escribe. Junta el catálogo de modelos (siempre disponible) con lo que
 * otras personas ya buscaron en este servidor. Si la base de datos falla, se sugiere solo con el catálogo.
 */
export function createSuggestService(deps: SuggestDeps) {
  async function learned(country: string, firstToken: string): Promise<LearnedTerm[]> {
    if (firstToken.length < 2) return [];
    const key = `learned:${country}:${firstToken}`;
    const hit = deps.cache.get<LearnedTerm[]>(key);
    if (hit !== undefined) return hit;
    try {
      const terms = await deps.history.learnedTerms(country, firstToken, 50);
      deps.cache.set(key, terms, deps.learnedTtlMs);
      return terms;
    } catch (err) {
      deps.onHistoryError?.(err);
      return [];
    }
  }

  async function forQuery(query: string, country: string, limit: number): Promise<SuggestResponse> {
    const tokens = suggestTokens(query);
    const terms = await learned(country, tokens[0] ?? '');
    return suggest({ query, models: deps.models, learned: terms, limit });
  }

  return { forQuery };
}

export type SuggestService = ReturnType<typeof createSuggestService>;
