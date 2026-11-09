import { KNOWN_MODELS, type ModelCategory } from './models.ts';
import { isNumericToken, stem, tokenize } from './text.ts';

/**
 * "Lo que buscas" contra "cosas para lo que buscas". Al buscar "PlayStation 5" salen la consola, juegos y controles;
 * todos coinciden con las palabras. Para enseñar primero la consola se usa la categoría del modelo conocido
 * ("consola") y, si no la hay, la posición de lo buscado en el título: el producto mismo lo nombra al principio
 * ("Consola PlayStation 5 Slim"); lo que es para él lo nombra al final ("Control DualSense para PlayStation 5").
 */

const CATEGORY_WORDS: Record<ModelCategory, string[]> = {
  consola: ['consola'],
  celular: ['celular', 'smartphone', 'telefono'],
  pantalla: ['pantalla', 'television', 'televisor', 'tv'],
  laptop: ['laptop', 'portatil', 'notebook'],
  tableta: ['tablet', 'tableta'],
  audio: ['audifonos', 'audifono', 'bocina', 'auriculares', 'auricular'],
  reloj: ['reloj', 'smartwatch'],
  hogar: [],
  computo: [],
  foto: ['camara'],
};

/** Categoría del modelo conocido que coincide con la búsqueda ("playstation 5 slim" → consola), o null. */
export function queryCategory(queryTokens: string[]): ModelCategory | null {
  const asked = new Set(queryTokens);
  let best: { category: ModelCategory; size: number } | null = null;
  for (const m of KNOWN_MODELS) {
    const modelTokens = tokenize(m.model);
    if (modelTokens.length === 0 || !modelTokens.every((t) => asked.has(t))) continue;
    if (!best || modelTokens.length > best.size) best = { category: m.category, size: modelTokens.length };
  }
  return best?.category ?? null;
}

/** El título nombra la categoría buscada ("Consola …", "Pantalla …"). */
export function mentionsCategory(title: string, category: ModelCategory): boolean {
  const words = new Set(CATEGORY_WORDS[category].map(stem));
  if (words.size === 0) return false;
  return tokenize(title).some((t) => words.has(t));
}

/** Palabras que delatan que el título es algo PARA el producto aunque lo nombre al principio ("Nintendo Switch 2 Juego …"). */
const NOT_THE_PRODUCT = new Set(['juego', 'videojuego', 'game', 'dlc', 'control', 'funda', 'cable', 'cargador', 'accesorio', 'estuche', 'mica', 'base', 'soporte'].map(stem));

/** Lo buscado aparece al principio del título (entre las dos primeras palabras) y nada delata un accesorio o un juego. */
export function leadsWithQuery(title: string, queryTokens: string[]): boolean {
  const asked = new Set(queryTokens.filter((t) => !isNumericToken(t)));
  const tokens = tokenize(title);
  if (tokens.some((t) => NOT_THE_PRODUCT.has(t) && !asked.has(t))) return false;
  if (asked.size === 0) return true;
  const idx = tokens.findIndex((t) => asked.has(t));
  return idx !== -1 && idx <= 1;
}

/** Un grupo con precio mínimo por debajo de esta fracción del producto más barato de la categoría no es el producto. */
const MIN_PRICE_SHARE = 0.35;

/**
 * Qué grupos son "lo buscado": los que nombran la categoría del modelo conocido ("Consola …") y los que empiezan
 * con lo buscado sin delatar un accesorio. Cuando hay categoría, lo que cuesta una fracción de la consola más
 * barata (un juego de $999 junto a consolas de $9,999) tampoco cuenta.
 */
export function focusGroups<T extends { offers: { title: string }[]; minPrice: number }>(groups: T[], queryTokens: string[]): Set<T> {
  const category = queryCategory(queryTokens);
  const byCategory = category ? groups.filter((g) => g.offers.some((o) => mentionsCategory(o.title, category))) : [];
  // Precio de referencia: la mediana de lo que nombra la categoría (el mínimo lo envenena una "unidad de disco para
  // consola" de $1,999 que también dice "consola"). Por debajo de un tercio de eso no es la consola.
  const prices = byCategory.map((g) => g.minPrice).sort((a, b) => a - b);
  const anchor = prices.length > 0 ? (prices.length % 2 ? prices[(prices.length - 1) / 2]! : (prices[prices.length / 2 - 1]! + prices[prices.length / 2]!) / 2) : 0;
  const floor = anchor * MIN_PRICE_SHARE;
  const focus = new Set<T>();
  for (const g of groups) {
    if (g.minPrice < floor) continue;
    if (byCategory.includes(g) || g.offers.some((o) => leadsWithQuery(o.title, queryTokens))) focus.add(g);
  }
  return focus;
}
