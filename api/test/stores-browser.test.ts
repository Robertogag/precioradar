import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCoppelSearch } from '../src/infrastructure/stores/coppel.ts';
import { parseSearsSearch, searsProductUrl } from '../src/infrastructure/stores/sears.ts';

/** Respuestas REALES (recortadas) que las páginas de Coppel y Sears piden al buscar "nintendo switch 2", 8-nov-2026. */
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('lectores del carril de navegador', () => {
  it('Coppel: precio con descuento, precio de lista, vendedor del marketplace y liga completa', () => {
    const offers = parseCoppelSearch(fixture('coppel.json'));
    expect(offers.length).toBeGreaterThanOrEqual(4);
    const first = offers[0]!;
    expect(first).toMatchObject({ title: 'Nintendo Switch 2', brand: 'Nintendo', price: 12299, listPrice: 15399, currency: 'MXN', seller: 'Fabrica Directo' });
    expect(first.url).toBe('https://www.coppel.com/pdp/nintendo-switch-2-mkp-75321184');
    expect(first.imageUrl).toMatch(/^https:\/\/cdn5\.coppel\.com\//);
    // Lo que vende Coppel directamente no lleva "vendedor".
    expect(offers.find((o) => o.title.startsWith('Consola Portátil Nintendo Switch 2 Mario Kart'))?.seller).toBeNull();
  });

  it('Sears: precio de oferta contra precio regular, código de barras, solo con existencia, liga con id y nombre', () => {
    const offers = parseSearsSearch(fixture('sears.json'));
    expect(offers.length).toBeGreaterThanOrEqual(2);
    const first = offers[0]!;
    expect(first).toMatchObject({ externalId: '3522519', title: 'Consola Nintendo Switch 2', brand: 'NINTENDO', price: 12799, listPrice: 13999, seller: null });
    expect(first.url).toBe('https://www.sears.com.mx/producto/3522519/consola-nintendo-switch-2');
    expect(searsProductUrl('1', 'Pantalla LG 55" 4K UHD (2026)')).toBe('https://www.sears.com.mx/producto/1/pantalla-lg-55-4k-uhd-2026');
    const empty = JSON.stringify({ results: [{ index: 'sears', hits: [{ objectID: '9', title: 'Sin existencia', price: 100, stock: 0 }] }] });
    expect(parseSearsSearch(empty)).toEqual([]);
  });
});
