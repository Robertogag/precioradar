/** Utilidades de texto del dominio: todo lo que compara títulos pasa por aquí para que se normalice igual. */

const STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'o', 'en', 'con', 'para', 'por', 'a', 'al',
]);

/** Unidades que se pegan al número anterior: "128 gb" → "128gb", "55 pulgadas" → "55pulgadas". */
const UNITS = new Set([
  'gb', 'tb', 'mb', 'ml', 'l', 'lt', 'lts', 'kg', 'g', 'gr', 'mg', 'oz', 'lb', 'w', 'kw', 'v', 'mah', 'hz', 'mm', 'cm',
  'm', 'pulgadas', 'pulg', 'in', 'pzas', 'pza', 'piezas', 'pz', 'rollos', 'hojas', 'k', 'mp', 'btu', 'hp', 'ton',
]);

const UNIT_ALIASES: Record<string, string> = {
  lt: 'l', lts: 'l', gr: 'g', pulg: 'pulgadas', in: 'pulgadas', pza: 'pzas', piezas: 'pzas', pz: 'pzas',
};

/** Minúsculas, sin acentos, sin signos. Conserva el punto decimal entre dígitos ("6.1"). */
/** Abreviaturas que las tiendas usan por el nombre completo: así "para PS5" se entiende como "para PlayStation 5". */
const ALIASES: [RegExp, string][] = [
  [/\bps\s?([345])\b/g, 'playstation $1'],
  [/\bnsw\s?2\b/g, 'nintendo switch 2'],
  [/\bnsw\b/g, 'nintendo switch'],
];

export function normalize(text: string): string {
  let lowered = text.toLowerCase();
  for (const [re, by] of ALIASES) lowered = lowered.replace(re, by);
  return lowered
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/(\d)[”"″]/g, '$1 pulgadas ')
    .replace(/(\d),(\d{3})\b/g, '$1$2')
    .replace(/(\d)\.(\d)/g, '$1§$2')
    .replace(/[^a-z0-9§]+/g, ' ')
    .replace(/§/g, '.')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Singular aproximado: suficiente para que "audifonos" empate con "audifono" y "celulares" con "celular". */
export function stem(token: string): string {
  if (/\d/.test(token) || token.length <= 3) return token;
  // "plus" no es el plural de "plu": los calificadores de modelo se quedan como están.
  if (MODEL_QUALIFIERS.has(token)) return token;
  let out = token;
  if (out.endsWith('es') && out.length > 5) out = out.slice(0, -2);
  else if (out.endsWith('s')) out = out.slice(0, -1);
  // "serie"/"series", "cable"/"cables": la e final también se quita para que singular y plural queden iguales.
  if (out.length > 4 && out.endsWith('e')) out = out.slice(0, -1);
  return out;
}

/**
 * Parte un texto en palabras comparables: separa "128gb" pegado o suelto en un solo token "128gb",
 * quita palabras vacías y deja cada palabra en singular.
 */
export function tokenize(text: string): string[] {
  const raw = normalize(text)
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .split(' ')
    .filter(Boolean);

  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const tok = raw[i]!;
    const next = raw[i + 1];
    if (/^\d+(\.\d+)?$/.test(tok) && next && UNITS.has(next)) {
      out.push(tok + (UNIT_ALIASES[next] ?? next));
      i++;
      continue;
    }
    if (STOPWORDS.has(tok)) continue;
    out.push(stem(tok));
  }
  return out;
}

export function isNumericToken(token: string): boolean {
  return /^\d/.test(token);
}

/**
 * Clave corta de modelo en una palabra tal cual la escribió la tienda (antes de partirla): "s24", "a16", "16e", "6s".
 * La letra distingue hermanos que comparten el número; un número con unidad ("128gb", "55k") no es clave.
 */
export function isShortModelCode(word: string): boolean {
  if (/^[a-z]{1,2}\d{2,4}[a-z]{0,2}$/.test(word)) return true;
  const m = word.match(/^\d{1,4}([a-z]{1,2})$/);
  return m !== null && !UNITS.has(m[1]!);
}

/** Código de barras comparable entre tiendas: solo dígitos, sin ceros a la izquierda, y de largo creíble. */
export function normalizeGtin(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '').replace(/^0+/, '');
  return digits.length >= 8 && digits.length <= 14 ? digits : null;
}

export function parseMoney(text: string | null | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/\s/g, '').match(/\$?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?/);
  if (!m || !m[1]) return null;
  const n = Number(m[1].replace(/,/g, '') + (m[2] ? `.${m[2]}` : ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Palabras que describen sin distinguir el producto: colores, conectividad y relleno comercial. "Nintendo Switch 2,
 * 256GB, Wi-Fi, Negro" y "Consola Nintendo Switch 2 de 256 GB edición estándar" son lo mismo; estas palabras no cuentan
 * al comparar títulos.
 */
export const DESCRIPTOR_WORDS: ReadonlySet<string> = new Set([
  // colores
  'negro', 'negra', 'blanco', 'blanca', 'azul', 'rojo', 'roja', 'gris', 'verde', 'rosa', 'morado', 'morada', 'plata',
  'plateado', 'plateada', 'dorado', 'dorada', 'grafito', 'titanio', 'natural', 'medianoche', 'midnight', 'starlight',
  'violeta', 'lila', 'beige', 'cafe', 'marron', 'naranja', 'amarillo', 'amarilla', 'turquesa', 'coral', 'lavanda',
  'menta', 'mint', 'crema', 'arena', 'black', 'white', 'blue', 'red', 'gray', 'grey', 'green', 'pink', 'purple',
  'silver', 'gold', 'graphite', 'titanium', 'navy', 'teal',
  // conectividad y relleno comercial
  'wi', 'fi', 'wifi', 'bluetooth', '4g', '5g', 'lte', 'esim', 'sim', 'dual', 'nfc',
  'edicion', 'edition', 'estandar', 'standard', 'version', 'nuevo', 'nueva', 'new',
  'original', 'oficial', 'color', 'modelo', 'model', 'desbloqueado', 'desbloqueada', 'unlocked', 'liberado',
  'liberada', 'nacional', 'importado', 'importada', 'garantia', 'envio', 'gratis', 'oferta', 'promocion',
]);

/** Las palabras que sí identifican al producto: `tokenize` sin colores ni relleno. */
export function coreTokens(text: string): string[] {
  return tokenize(text).filter((t) => !DESCRIPTOR_WORDS.has(t));
}

/** Palabras que distinguen modelos hermanos: un "15 Pro" no es un "15", un "S25 Ultra" no es un "S25". */
export const MODEL_QUALIFIERS: ReadonlySet<string> = new Set([
  'pro', 'max', 'plus', 'mini', 'ultra', 'lite', 'se', 'air', 'fe', 'slim', 'oled', 'qled', 'neo', 'edge', 'fold', 'flip',
]);
