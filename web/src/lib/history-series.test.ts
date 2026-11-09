import { describe, expect, it } from 'vitest';
import type { PriceHistoryItem } from '../../../shared/contracts.ts';
import { DEFAULT_VISIBLE, MAX_VISIBLE, defaultSelection, eligibleSeries, orderSeries, toggleSeries } from '../../../shared/history-series.ts';

const item = (storeId: string, externalId: string, last: number): PriceHistoryItem => ({
  storeId,
  externalId,
  storeName: storeId.toUpperCase(),
  title: 'x',
  currency: 'MXN',
  url: 'https://x',
  points: [{ date: '2026-11-08', price: last, listPrice: null }],
  min: last,
  max: last,
  first: last,
  last,
  firstSeen: '2026-11-08',
  lastSeen: '2026-11-08',
});
const offer = (storeId: string, externalId: string, extras: string[] = []) => ({ id: `${storeId}:${externalId}`, storeName: storeId.toUpperCase(), extras });

describe('qué series del historial se enseñan', () => {
  const items = [item('c', '1', 12000), item('a', '1', 9999), item('a', '2', 10999), item('b', '1', 10919), item('d', '1', 13000), item('e', '1', 13500), item('f', '1', 14000), item('g', '1', 14899), item('h', '1', 15000), item('i', '1', 15500), item('j', '1', 16000), item('k', '1', 16500)];
  const offers = [offer('c', '1'), offer('a', '1'), offer('a', '2', ['Sports Resort']), offer('b', '1'), offer('d', '1'), offer('e', '1'), offer('f', '1'), offer('g', '1', ['Mario Kart']), offer('h', '1'), offer('i', '1'), offer('j', '1'), offer('k', '1')];
  const series = orderSeries(items, offers);

  it('ordena por último precio, la más barata primero, y marca los paquetes', () => {
    expect(series.map((s) => s.key)).toEqual(['a:1', 'b:1', 'a:2', 'c:1', 'd:1', 'e:1', 'f:1', 'g:1', 'h:1', 'i:1', 'j:1', 'k:1']);
    expect(series.find((s) => s.key === 'a:2')).toMatchObject({ bundle: true, extras: ['Sports Resort'] });
  });

  it('de entrada: solo producto solo, las 6 más baratas, colores 1 a 6', () => {
    const sel = defaultSelection(series, false);
    expect(sel.shown).toEqual(['a:1', 'b:1', 'c:1', 'd:1', 'e:1', 'f:1']);
    expect(sel.shown).toHaveLength(DEFAULT_VISIBLE);
    expect(sel.slots).toEqual({ 'a:1': 1, 'b:1': 2, 'c:1': 3, 'd:1': 4, 'e:1': 5, 'f:1': 6 });
    expect(eligibleSeries(series, true)).toHaveLength(12);
    expect(eligibleSeries(series, false)).toHaveLength(10);
    expect(defaultSelection(series, true).shown).toContain('a:2');
  });

  it('mostrar una tienda le da el color libre más bajo; ocultarla lo libera; con 8 a la vista sale la más cara', () => {
    const eligible = eligibleSeries(series, false);
    let sel = defaultSelection(series, false);
    sel = toggleSeries(sel, eligible, 'b:1'); // ocultar
    expect(sel.shown).toEqual(['a:1', 'c:1', 'd:1', 'e:1', 'f:1']);
    expect(sel.slots['b:1']).toBeUndefined();
    sel = toggleSeries(sel, eligible, 'h:1'); // mostrar: toma el color 2 que quedó libre y entra en su lugar por precio
    expect(sel.slots['h:1']).toBe(2);
    expect(sel.shown).toEqual(['a:1', 'c:1', 'd:1', 'e:1', 'f:1', 'h:1']);
    sel = toggleSeries(sel, eligible, 'b:1');
    sel = toggleSeries(sel, eligible, 'i:1');
    expect(sel.shown).toHaveLength(MAX_VISIBLE);
    expect(new Set(Object.values(sel.slots)).size).toBe(MAX_VISIBLE);
    // Ya hay 8: mostrar otra (j) saca a la más cara (i) para que ningún color se repita.
    sel = toggleSeries(sel, eligible, 'j:1');
    expect(sel.shown).toHaveLength(MAX_VISIBLE);
    expect(sel.shown).toContain('j:1');
    expect(sel.shown).not.toContain('i:1');
    expect(new Set(Object.values(sel.slots)).size).toBe(MAX_VISIBLE);
    // Ocultar una la quita sin tocar a las demás.
    sel = toggleSeries(sel, eligible, 'a:1');
    expect(sel.shown).toHaveLength(MAX_VISIBLE - 1);
    expect(sel.shown).not.toContain('a:1');
  });
});
