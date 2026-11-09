import { titleSimilarity } from './grouping.ts';

/**
 * Nombre del producto como lo esperan los buscadores por dirección (listado.mercadolibre.com.mx/nintendo-switch-2):
 * minúsculas, sin acentos ni símbolos, palabras unidas por guiones, sin pasar de `maxLength`.
 */
export function searchSlug(title: string, maxLength = 80): string {
  const plain = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const words = plain.replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let out = '';
  for (const w of words) {
    if (out.length + w.length + 1 > maxLength) break;
    out = out ? `${out}-${w}` : w;
  }
  return out;
}

export interface CatalogCandidate {
  id: string;
  name: string;
}

/**
 * El producto del catálogo de la tienda que corresponde a este título, o null si ninguno se parece lo suficiente.
 * Conservador a propósito: mandar al usuario a OTRO producto es peor que mandarlo al buscador.
 */
export function pickCatalogMatch<T extends CatalogCandidate>(candidates: T[], title: string, minSimilarity = 0.5): T | null {
  let best: T | null = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = titleSimilarity(c.name, title);
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best !== null && bestScore >= minSimilarity ? best : null;
}
