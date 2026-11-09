import type { Cache, Clock } from '../../application/ports.ts';

/**
 * Caché en memoria con vencimiento. Evita volver a consultar a las tiendas cuando se repite una búsqueda
 * o el usuario solo cambia el orden o un filtro: menos espera para él y menos carga para ellas.
 */
export function createMemoryCache(clock: Clock, maxEntries = 300): Cache {
  const entries = new Map<string, { value: unknown; expiresAt: number }>();
  return {
    get<T>(key: string): T | undefined {
      const hit = entries.get(key);
      if (!hit) return undefined;
      if (hit.expiresAt <= clock.now()) {
        entries.delete(key);
        return undefined;
      }
      return hit.value as T;
    },
    set<T>(key: string, value: T, ttlMs: number): void {
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value;
        if (oldest !== undefined) entries.delete(oldest);
      }
      entries.set(key, { value, expiresAt: clock.now() + ttlMs });
    },
  };
}
