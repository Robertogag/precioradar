/** $14,279 sin centavos cuando son .00; con centavos cuando los hay. En inglés sale "MX$14,279". */
export function money(value: number, currency: string, locale: string): string {
  const hasCents = Math.round(value * 100) % 100 !== 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: hasCents ? 2 : 0,
    }).format(value);
  } catch {
    return `$${value.toFixed(hasCents ? 2 : 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  }
}

export function integer(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  } catch {
    return String(Math.round(value));
  }
}

/** "hace 3 minutos" / "3 minutes ago"; menos de 45 s es "ahora". */
export function ago(iso: string, locale: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  try {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    if (seconds < 45) return rtf.format(0, 'second');
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return rtf.format(-minutes, 'minute');
    const hours = Math.round(minutes / 60);
    if (hours < 24) return rtf.format(-hours, 'hour');
    return rtf.format(-Math.round(hours / 24), 'day');
  } catch {
    return '';
  }
}

/** Porcentaje de ahorro entre el precio más bajo y el más alto de un grupo. */
export function savingsPct(minPrice: number, maxPrice: number): number {
  if (maxPrice <= 0 || maxPrice <= minPrice) return 0;
  return Math.round(((maxPrice - minPrice) / maxPrice) * 100);
}
