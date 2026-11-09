import { describe, expect, it } from 'vitest';
import type { Offer, ProductGroup } from '../../../shared/contracts.ts';
import { EMPTY_FILTERS, activeFilterCount, applyFilters, priceBounds, readSearchState, storeCounts, writeSearchState } from './filters.ts';

const offer = (storeId: string, price: number, discountPct: number | null = null): Offer => ({
  id: `${storeId}:1`,
  storeId,
  storeName: storeId.toUpperCase(),
  title: 'Apple iPhone 15 128GB',
  brand: 'Apple',
  price,
  listPrice: discountPct ? Math.round(price / (1 - discountPct / 100)) : null,
  discountPct,
  currency: 'MXN',
  url: `https://${storeId}.mx/p/1`,
  imageUrl: null,
  rating: null,
  reviews: null,
  seller: null,
  gtin: null,
  condition: 'nuevo',
  isAccessory: false,
  relevance: 1,
  extras: [],
});

const group = (key: string, offers: Offer[]): ProductGroup => {
  const sorted = [...offers].sort((a, b) => a.price - b.price);
  const best = sorted[0]!;
  const max = sorted[sorted.length - 1]!.price;
  return {
    key,
    title: best.title,
    brand: 'Apple',
    imageUrl: null,
    condition: 'nuevo',
    best,
    offers: sorted,
    storeCount: sorted.length,
    minPrice: best.price,
    maxPrice: max,
    recommendation: null,
    spread: max - best.price,
    links: [],
  };
};

const G1 = group('g1', [offer('amazon', 15000, 10), offer('liverpool', 14200), offer('costco', 16000)]);
const G2 = group('g2', [offer('elektra', 9000)]);
const G3 = group('g3', [offer('amazon', 21000), offer('liverpool', 20500, 5)]);

describe('applyFilters', () => {
  it('sin filtros devuelve lo mismo', () => {
    expect(applyFilters([G1, G2, G3], EMPTY_FILTERS)).toEqual([G1, G2, G3]);
  });

  it('elegir tiendas recalcula el mejor precio del grupo y quita los grupos que se quedan vacíos', () => {
    const out = applyFilters([G1, G2, G3], { ...EMPTY_FILTERS, stores: ['amazon', 'costco'] });
    expect(out.map((g) => g.key)).toEqual(['g1', 'g3']);
    expect(out[0]!.best.storeId).toBe('amazon');
    expect(out[0]!.minPrice).toBe(15000);
    expect(out[0]!.maxPrice).toBe(16000);
    expect(out[0]!.spread).toBe(1000);
    expect(out[0]!.storeCount).toBe(2);
  });

  it('el rango de precio se compara contra el precio más bajo del grupo', () => {
    expect(applyFilters([G1, G2, G3], { ...EMPTY_FILTERS, min: 10000 }).map((g) => g.key)).toEqual(['g1', 'g3']);
    expect(applyFilters([G1, G2, G3], { ...EMPTY_FILTERS, max: 15000 }).map((g) => g.key)).toEqual(['g1', 'g2']);
  });

  it('solo con descuento y solo en 2+ tiendas', () => {
    expect(applyFilters([G1, G2, G3], { ...EMPTY_FILTERS, onlyDiscount: true }).map((g) => g.key)).toEqual(['g1', 'g3']);
    expect(applyFilters([G1, G2, G3], { ...EMPTY_FILTERS, onlyMultiStore: true }).map((g) => g.key)).toEqual(['g1', 'g3']);
    // Quitar la tienda con descuento deja al grupo sin descuento.
    expect(applyFilters([G1], { ...EMPTY_FILTERS, stores: ['liverpool', 'costco'], onlyDiscount: true })).toEqual([]);
  });

  it('storeCounts cuenta productos por tienda, de más a menos; priceBounds da el rango de precios bajos', () => {
    expect(storeCounts([G1, G2, G3]).map((s) => `${s.id}:${s.count}`)).toEqual(['amazon:2', 'liverpool:2', 'costco:1', 'elektra:1']);
    expect(priceBounds([G1, G2, G3])).toEqual({ min: 9000, max: 20500 });
    expect(priceBounds([])).toBeNull();
  });
});

describe('estado de búsqueda en la URL', () => {
  it('lee la URL con valores por omisión y tolera basura', () => {
    const s = readSearchState(new URLSearchParams('q=  iphone   15 &orden=raro&tiendas=amazon,Mal%20Id,liverpool&min=abc&max=$20,000&desc=1'));
    expect(s.q).toBe('iphone 15');
    expect(s.sort).toBe('relevancia');
    expect(s.filters.stores).toEqual(['amazon', 'liverpool']);
    expect(s.filters.min).toBeNull();
    expect(s.filters.max).toBe(20000);
    expect(s.filters.onlyDiscount).toBe(true);
    expect(s.includeAccessories).toBe(false);
  });

  it('si min > max los voltea; recorta búsquedas larguísimas', () => {
    const s = readSearchState(new URLSearchParams(`q=${'a'.repeat(300)}&min=500&max=100`));
    expect(s.q).toHaveLength(120);
    expect(s.filters).toMatchObject({ min: 100, max: 500 });
  });

  it('escribe solo lo que no es por omisión y lo vuelve a leer igual', () => {
    const state = {
      q: 'galaxy s25',
      sort: 'precio' as const,
      includeAccessories: true,
      includeRefurbished: false,
      exact: false,
      filters: { stores: ['amazon'], min: null, max: 25000, onlyDiscount: false, onlyMultiStore: true },
    };
    const sp = writeSearchState(state);
    expect(sp.toString()).toBe('q=galaxy+s25&orden=precio&acc=1&tiendas=amazon&max=25000&varias=1');
    expect(readSearchState(sp)).toEqual(state);
    expect(writeSearchState({ q: 'tv', sort: 'relevancia', includeAccessories: false, includeRefurbished: false, exact: false, filters: EMPTY_FILTERS }).toString()).toBe('q=tv');
    expect(writeSearchState({ q: 'tv', sort: 'relevancia', includeAccessories: false, includeRefurbished: false, exact: true, filters: EMPTY_FILTERS }).toString()).toBe('q=tv&exacto=1');
  });

  it('cuenta los filtros activos para enseñarlo en el botón', () => {
    expect(activeFilterCount(EMPTY_FILTERS)).toBe(0);
    expect(activeFilterCount({ stores: ['a'], min: 1, max: null, onlyDiscount: true, onlyMultiStore: false })).toBe(3);
  });
});
