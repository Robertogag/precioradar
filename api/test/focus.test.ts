import { describe, expect, it } from 'vitest';
import { focusGroups, leadsWithQuery, mentionsCategory, queryCategory } from '../src/domain/focus.ts';
import { groupOffers, sortGroups } from '../src/domain/grouping.ts';
import { detectAccessory, toOffer } from '../src/domain/offer.ts';
import { normalize, tokenize } from '../src/domain/text.ts';

const q = (s: string) => tokenize(s);

describe('lo buscado primero', () => {
  it('"PS5" y "NSW2" se leen como el nombre completo: el control "para PS5" es un accesorio de PlayStation 5', () => {
    expect(normalize('Control DualSense para PS5')).toBe('control dualsense para playstation 5');
    expect(normalize('Zelda NSW2')).toBe('zelda nintendo switch 2');
    const ps = q('playstation 5');
    expect(detectAccessory(q('Control DualSense Midnight Black inalámbrico para PS5'), ps, 'Control DualSense Midnight Black inalámbrico para PS5')).toBe(true);
  });

  it('la búsqueda de un modelo conocido trae su categoría; un título que la nombra es "lo buscado"', () => {
    expect(queryCategory(q('playstation 5'))).toBe('consola');
    expect(queryCategory(q('playstation 5 slim'))).toBe('consola');
    expect(queryCategory(q('iphone 16'))).toBe('celular');
    expect(queryCategory(q('licuadora oster'))).toBeNull();
    expect(mentionsCategory('Consola PlayStation 5 Slim 1TB', 'consola')).toBe(true);
    expect(mentionsCategory('Gta Grand Theft Auto V Ps5 Playstation 5', 'consola')).toBe(false);
    expect(leadsWithQuery('Sony PlayStation 5 Pro 2TB', q('playstation 5'))).toBe(true);
    expect(leadsWithQuery('Gta Grand Theft Auto V Ps5 Playstation 5 - Game Center', q('playstation 5'))).toBe(false);
  });

  it('al buscar "PlayStation 5", la consola va antes que el juego aunque el juego esté en más tiendas y sea más barato', () => {
    const ps = q('playstation 5');
    const mk = (storeId: string, title: string, price: number, brand: string | null = null) =>
      toOffer({ externalId: `${storeId}-${title}`, title, price, url: 'https://x', brand }, { id: storeId, name: storeId, currency: 'MXN' }, ps)!;
    const offers = [
      mk('sears', 'Gta Grand Theft Auto V Ps5 Playstation 5 - Game Center', 849, 'BLU RAY'),
      mk('costco', 'Grand Theft Auto V PS5', 1249, 'Rockstar'),
      mk('suburbia', 'Grand Theft Auto V bundle para PS5', 1549, 'Rockstar'),
      mk('liverpool', 'Consola PlayStation 5 Slim 1TB con lector de discos', 10999, 'Sony'),
      mk('elektra', 'Sony PlayStation 5 Pro 2TB', 15999, 'Sony'),
      // Dice "consola" pero es un accesorio de $1,999: no debe contar como consola ni bajar la referencia de precio.
      mk('coppel', 'PlayStation 5 Unidad de Disco - Consola Slim digital', 1999, 'Sony'),
      mk('sears', 'PlayStation 5 - Astro Bot', 1099, 'Sony'),
    ];
    const grouped = groupOffers(offers, ps);
    const focus = focusGroups(grouped, ps);
    const focusTitles = [...focus].map((g) => g.title);
    expect(focusTitles.some((t) => /Unidad de Disco|Astro Bot|Grand Theft/.test(t))).toBe(false);
    const byRelevance = sortGroups(grouped, 'relevancia', focus);
    expect(byRelevance[0]!.offers[0]!.storeId).toBe('liverpool');
    expect(byRelevance.slice(0, 2).every((g) => /consola playstation 5 slim|pro 2tb/i.test(g.title))).toBe(true);
    const byPrice = sortGroups(grouped, 'precio', focus);
    expect(byPrice[0]!.minPrice).toBe(10999);
    expect(byPrice[byPrice.length - 1]!.title).toMatch(/Grand Theft Auto|Astro Bot|Unidad de Disco/);
  });

  it('con categoría conocida, lo que cuesta una fracción de la consola no es la consola aunque empiece igual', () => {
    const sw = q('nintendo switch 2');
    const mk = (id: string, title: string, price: number) => toOffer({ externalId: id, title, price, url: 'https://x', brand: 'Nintendo' }, { id, name: id, currency: 'MXN' }, sw)!;
    const grouped = groupOffers([mk('a', 'Nintendo Switch 2 Star Fox', 999), mk('b', 'Nintendo Switch 2 Juego Tamagotchi Plaza', 989), mk('c', 'Consola Nintendo Switch 2 256GB', 9999), mk('d', 'Nintendo Switch 2 Edición Mario Kart World', 10999)], sw);
    const focus = focusGroups(grouped, sw);
    const titles = [...focus].map((g) => g.title);
    expect(titles).toContain('Consola Nintendo Switch 2 256GB');
    expect(titles).toContain('Nintendo Switch 2 Edición Mario Kart World');
    expect(titles.some((t) => /Star Fox|Tamagotchi/.test(t))).toBe(false);
    const byPrice = sortGroups(grouped, 'precio', focus);
    expect(byPrice[0]!.minPrice).toBe(9999);
  });

  it('sin categoría conocida manda la posición: "Licuadora Oster…" antes que "Vaso para licuadora Oster"', () => {
    const lo = q('licuadora oster');
    const mk = (id: string, title: string, price: number) => toOffer({ externalId: id, title, price, url: 'https://x', brand: 'Oster' }, { id, name: id, currency: 'MXN' }, lo)!;
    const grouped = groupOffers([mk('a', 'Jarra de repuesto 1.25 L para licuadora Oster', 299), mk('b', 'Licuadora Oster 3 velocidades vaso de vidrio', 1099)], lo);
    const sorted = sortGroups(grouped, 'precio', focusGroups(grouped, lo));
    expect(sorted[0]!.offers[0]!.storeId).toBe('b');
  });
});
