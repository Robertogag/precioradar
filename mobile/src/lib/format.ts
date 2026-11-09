import type { StoreRunStatus } from '../../../shared/contracts';

/** $14,279 sin centavos cuando son .00; con centavos cuando los hay. */
export function money(value: number, currency = 'MXN'): string {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  try {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency,
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    }).format(value);
  } catch {
    return `$${value.toFixed(hasCents ? 2 : 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Qué le pasó a una tienda, dicho como se lo dirías a una persona. */
export const storeStatusText: Record<StoreRunStatus, string> = {
  ok: 'Respondió',
  'sin-resultados': 'No tiene este producto',
  bloqueada: 'No dejó consultar',
  'requiere-credenciales': 'Falta conectarla',
  'tiempo-agotado': 'Tardó demasiado',
  error: 'Falló',
};
