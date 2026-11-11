import type { RefreshJobResult, SearchResponse } from '../../../shared/contracts.ts';
import type { Clock, SearchHistory } from './ports.ts';
import type { SearchInput } from './searchOffers.ts';

export interface RefreshJobDeps {
  search: (input: SearchInput) => Promise<SearchResponse>;
  history: SearchHistory;
  clock: Clock;
  /** Cuántas búsquedas populares se refrescan por corrida. */
  maxTerms: number;
  /** Cuántas búsquedas corren a la vez (cada una ya consulta a todas las tiendas en paralelo). */
  concurrency: number;
}

/**
 * Trabajo programado: vuelve a consultar las búsquedas más repetidas para que el historial de precios crezca
 * día con día aunque nadie entre. Lo dispara Cloud Scheduler; cada búsqueda guarda sus precios como siempre.
 */
export function createRefreshJob(deps: RefreshJobDeps) {
  async function run(country: string): Promise<RefreshJobResult> {
    const started = deps.clock.now();
    const terms = await deps.history.topTerms(country, deps.maxTerms);
    let searches = 0;
    let offers = 0;
    const queue = [...terms];
    const worker = async () => {
      for (let term = queue.shift(); term !== undefined; term = queue.shift()) {
        try {
          const res = await deps.search({ query: term, country, state: null, sort: 'relevancia', includeAccessories: true, includeRefurbished: true, fresh: true, origin: 'refresco' });
          searches++;
          offers += res.totalOffers;
        } catch {
          // una búsqueda fallida no detiene el refresco de las demás
        }
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, deps.concurrency) }, worker));
    return { country, terms: terms.length, searches, offers, tookMs: deps.clock.now() - started };
  }

  return { run };
}

export type RefreshJob = ReturnType<typeof createRefreshJob>;
