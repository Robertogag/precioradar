/**
 * Color de cada tienda para su monograma. No son logotipos: es una inicial sobre el color con que la gente
 * reconoce a la tienda, suficiente para ubicarla de un vistazo en una lista de precios.
 */
const BRAND: Record<string, { bg: string; fg: string }> = {
  amazon: { bg: '#232F3E', fg: '#FF9900' },
  mercadolibre: { bg: '#FFE600', fg: '#2D3277' },
  liverpool: { bg: '#E10098', fg: '#FFFFFF' },
  costco: { bg: '#005DAA', fg: '#FFFFFF' },
  elektra: { bg: '#D7141A', fg: '#FFFFFF' },
  chedraui: { bg: '#F26B21', fg: '#FFFFFF' },
  officemax: { bg: '#1F3C88', fg: '#FFFFFF' },
  sony: { bg: '#111111', fg: '#FFFFFF' },
  whirlpool: { bg: '#EEB111', fg: '#1B1B1B' },
  marti: { bg: '#C8102E', fg: '#FFFFFF' },
  mobo: { bg: '#00A3E0', fg: '#FFFFFF' },
  sally: { bg: '#1A1A1A', fg: '#FFFFFF' },
  cyberpuerta: { bg: '#0B4EA2', fg: '#FFFFFF' },
  walmart: { bg: '#0071DC', fg: '#FFC220' },
  bodega: { bg: '#3D9B35', fg: '#FFFFFF' },
  sams: { bg: '#0067A0', fg: '#FFFFFF' },
  sears: { bg: '#00539B', fg: '#FFFFFF' },
  sanborns: { bg: '#C8102E', fg: '#FFFFFF' },
  claroshop: { bg: '#DA291C', fg: '#FFFFFF' },
  soriana: { bg: '#E4002B', fg: '#FFFFFF' },
  palacio: { bg: '#FFD100', fg: '#111111' },
  heb: { bg: '#E1251B', fg: '#FFFFFF' },
  coppel: { bg: '#0055B8', fg: '#FFD100' },
  homedepot: { bg: '#F96302', fg: '#FFFFFF' },
  officedepot: { bg: '#CC0000', fg: '#FFFFFF' },
};

const FALLBACK = ['#4F46E5', '#0E9384', '#C11574', '#B54708', '#175CD3', '#5925DC'];

export function storeBrand(storeId: string): { bg: string; fg: string } {
  const known = BRAND[storeId];
  if (known) return known;
  let hash = 0;
  for (const ch of storeId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { bg: FALLBACK[hash % FALLBACK.length]!, fg: '#FFFFFF' };
}

/** "Mercado Libre" → "ML", "Elektra" → "E". */
export function storeInitials(name: string): string {
  const words = name.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ ]/g, ' ').split(' ').filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return (words[0]?.[0] ?? '?').toUpperCase();
}
