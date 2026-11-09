/** Fechas de calendario (AAAA-MM-DD) en la hora de México, que es donde están las tiendas y la gente. */

export const TIME_ZONE = 'America/Mexico_City';

const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** El día de calendario (en México) de un instante. */
export function dayOf(instant: number | Date): string {
  return fmt.format(typeof instant === 'number' ? new Date(instant) : instant);
}

/** Suma días a un día de calendario. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  const t = Date.UTC(y, m - 1, d + n);
  return new Date(t).toISOString().slice(0, 10);
}

export function isDay(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
