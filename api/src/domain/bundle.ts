/**
 * Paquetes: "Nintendo Switch 2 + Mario Kart World", "iPhone 15 con AppleCare+", "Switch 2 Bundle: EA Sports FC27".
 * Es el mismo producto con algo extra; se separa el producto base de lo que incluye para poder agruparlo con
 * las demás tiendas y, a la vez, contar el extra a su favor.
 */

/** Un "+" entre dos cosas (con espacios, o pegado entre dos palabras). No el "+" de un nombre ("AppleCare+", "Disney+"). */
const PLUS = /\s+\+\s+(?=\S)|(?<=[A-Za-z0-9])\+(?=[A-Za-z][A-Za-z0-9]{2,})/;

/** Palabras que anuncian un extra. Solo cuentan en medio del título, nunca al inicio ("Combo de rotomartillo…" es el producto). */
const MARKER = /\s+(?:incluye|gratis|de regalo|regalo|bundle|combo|paquete con|kit con)\b[:\s-]*/i;

/** "con" solo anuncia extra cuando lo que sigue es claramente un añadido, no una característica. */
const WITH = /\s+con\s+(?=(?:applecare|garant[ií]a|membres[ií]a|suscripci[oó]n|tarjeta de regalo|\d+\s*meses|audífonos|audifonos|funda|mica|cargador inal|bocina|control extra|juego)\b)/i;

const MIN_BASE_WORDS = 2;

/** "eSIM + SIM Física" describe el teléfono, no regala nada: eso no es un extra. */
const NOT_AN_EXTRA = /^(?:(?:e-?sim|sim|f[ií]sic[ao]|dual|nano|tarjeta|chip|incluid[ao])\b[\s,+]*)+$/i;

export interface BundleSplit {
  /** El producto sin los extras. Si no se detectó ningún extra, es el título original. */
  base: string;
  extras: string[];
}

function clean(text: string): string {
  return text
    .replace(/^[\s:,\-–—()]+|[\s:,\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

export function splitExtras(title: string): BundleSplit {
  const parts = title.split(PLUS);
  let base = parts[0] ?? title;
  const extras: string[] = parts
    .slice(1)
    .map(clean)
    .filter((e) => e && !NOT_AN_EXTRA.test(e));

  const marker = base.match(MARKER) ?? base.match(WITH);
  if (marker && marker.index !== undefined && marker.index > 0) {
    const extra = clean(base.slice(marker.index + marker[0].length));
    if (extra) extras.unshift(extra);
    base = base.slice(0, marker.index);
  }

  base = clean(base);
  if (extras.length === 0 || base.split(' ').filter(Boolean).length < MIN_BASE_WORDS) {
    return { base: title.trim(), extras: [] };
  }
  return { base, extras };
}
