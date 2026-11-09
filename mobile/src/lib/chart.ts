/** Geometría de gráficas: curva suave sin rebases y escalas sencillas. Sin dependencias. */

export interface Pt {
  x: number;
  y: number;
}

/**
 * Curva monótona (Fritsch–Carlson) por los puntos: suave, pero nunca se pasa por arriba o por abajo
 * de un precio real entre dos días.
 */
export function monotonePath(pts: Pt[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0]!.x},${pts[0]!.y}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1]!.x - pts[i]!.x;
    m[i] = (pts[i + 1]!.y - pts[i]!.y) / (dx[i] || 1);
  }
  const t: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
  t[n - 1] = m[n - 2]!;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i]! / m[i]!;
    const b = t[i + 1]! / m[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const tau = 3 / Math.sqrt(s);
      t[i] = tau * a * m[i]!;
      t[i + 1] = tau * b * m[i]!;
    }
  }
  let d = `M${r(pts[0]!.x)},${r(pts[0]!.y)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3;
    d += ` C${r(pts[i]!.x + h)},${r(pts[i]!.y + t[i]! * h)} ${r(pts[i + 1]!.x - h)},${r(pts[i + 1]!.y - t[i + 1]! * h)} ${r(pts[i + 1]!.x)},${r(pts[i + 1]!.y)}`;
  }
  return d;
}

const r = (v: number) => Math.round(v * 10) / 10;

/** Ticks "bonitos" del eje de precio: hasta `count` divisiones redondeadas. */
export function niceTicks(min: number, max: number, count = 3): number[] {
  if (max <= min) return [min];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => s >= raw) ?? raw;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001 && ticks.length < 8; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

/** Qué etiquetas del eje X enseñar para que quepan: como máximo `max`, repartidas e incluyendo la última. */
export function labelIndexes(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const step = Math.ceil((n - 1) / (max - 1));
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i -= step) out.unshift(i);
  return out;
}
