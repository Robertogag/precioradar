import { describe, expect, it } from 'vitest';
import { ago, money, savingsPct } from './format.ts';

describe('dinero', () => {
  it('sin centavos cuando son .00 y con centavos cuando los hay', () => {
    expect(money(14279, 'MXN', 'es-MX')).toBe('$14,279');
    expect(money(14279.5, 'MXN', 'es-MX')).toBe('$14,279.50');
  });
  it('en inglés distingue la moneda', () => {
    expect(money(14279, 'MXN', 'en-US')).toBe('MX$14,279');
  });
});

describe('hace cuánto', () => {
  const now = Date.parse('2026-11-07T18:00:00Z');
  it('ahora, minutos, horas, días', () => {
    expect(ago('2026-11-07T17:59:50Z', 'es-MX', now)).toBe('ahora');
    expect(ago('2026-11-07T17:57:00Z', 'es-MX', now)).toBe('hace 3 minutos');
    expect(ago('2026-11-07T15:00:00Z', 'en-US', now)).toBe('3 hours ago');
    expect(ago('2026-11-05T18:00:00Z', 'en-US', now)).toBe('2 days ago');
    expect(ago('no-fecha', 'es-MX', now)).toBe('');
  });
});

describe('ahorro', () => {
  it('porcentaje frente a la tienda más cara', () => {
    expect(savingsPct(14200, 16000)).toBe(11);
    expect(savingsPct(100, 100)).toBe(0);
    expect(savingsPct(100, 0)).toBe(0);
  });
});
