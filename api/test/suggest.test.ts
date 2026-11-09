import { describe, expect, it } from 'vitest';
import { KNOWN_MODELS, modelSearchText } from '../src/domain/models.ts';
import { siblingsOf, suggest, suggestTokens } from '../src/domain/suggest.ts';

const run = (query: string, learned: { text: string; hits: number }[] = []) =>
  suggest({ query, models: KNOWN_MODELS, learned });

describe('suggestTokens', () => {
  it('separa letras de números y quita acentos', () => {
    expect(suggestTokens('Galaxy S25 Ultra')).toEqual(['galaxy', 's', '25', 'ultra']);
    expect(suggestTokens('iphone15 256gb')).toEqual(['iphone', '15', '256', 'gb']);
    expect(suggestTokens('Batería de cocina')).toEqual(['bateria', 'de', 'cocina']);
  });
});

describe('suggest: modelos por prefijo', () => {
  it('con pocas letras propone modelos que empiezan así', () => {
    const { suggestions } = run('iph');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.every((s) => s.text.toLowerCase().includes('iphone'))).toBe(true);
    expect(suggestions.every((s) => s.kind === 'modelo')).toBe(true);
  });

  it('cada palabra escrita es el inicio de una palabra del modelo, en cualquier orden', () => {
    const { suggestions } = run('15 pro iph');
    expect(suggestions.map((s) => s.text)).toContain('Apple iPhone 15 Pro');
    expect(suggestions.some((s) => s.text === 'Apple iPhone 16 Pro')).toBe(false);
  });

  it('"s25" pegado encuentra Galaxy S25', () => {
    expect(run('galaxy s25').suggestions.map((s) => s.text)).toContain('Samsung Galaxy S25 Ultra');
  });

  it('no sugiere lo mismo que ya está escrito ni repite textos', () => {
    const { suggestions } = run('Apple iPhone 15');
    const texts = suggestions.map((s) => s.text.toLowerCase());
    expect(texts).not.toContain('apple iphone 15');
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('menos de dos letras o solo espacios: nada', () => {
    expect(run('i').suggestions).toEqual([]);
    expect(run('   ').suggestions).toEqual([]);
  });

  it('respeta el límite', () => {
    expect(suggest({ query: 'samsung', models: KNOWN_MODELS, learned: [], limit: 5 }).suggestions).toHaveLength(5);
  });
});

describe('suggest: modelo completo → variantes y hermanos para comparar', () => {
  it('iPhone 15 completo: primero sus capacidades, y aparte los 15 Plus / Pro / Pro Max', () => {
    const { suggestions, related } = run('iphone 15');
    expect(suggestions[0]).toMatchObject({ text: 'Apple iPhone 15 128GB', kind: 'variante', brand: 'Apple' });
    const relatedTexts = related.map((r) => r.text);
    expect(relatedTexts).toEqual(
      expect.arrayContaining(['Apple iPhone 15 256GB', 'Apple iPhone 15 Pro', 'Apple iPhone 15 Plus', 'Apple iPhone 15 Pro Max']),
    );
    expect(relatedTexts).not.toContain('Apple iPhone 16');
  });

  it('un modelo a medias ("iphone 1") no es completo: no propone capacidades', () => {
    const { suggestions, related } = run('iphone 1');
    expect(suggestions.every((s) => s.kind === 'modelo')).toBe(true);
    expect(related).toEqual([]);
  });

  it('hermanos de una pantalla: misma marca, categoría y generación', () => {
    const sib = siblingsOf(KNOWN_MODELS.find((m) => m.model === 'OLED C4')!, KNOWN_MODELS).map((m) => m.model);
    expect(sib).toContain('OLED B4');
    expect(sib).not.toContain('UHD UT80');
  });

  it('la variante se busca con marca + modelo + variante', () => {
    const tv = KNOWN_MODELS.find((m) => m.model === 'OLED C4')!;
    expect(modelSearchText(tv, '55 pulgadas')).toBe('LG OLED C4 55 pulgadas');
    const watch = KNOWN_MODELS.find((m) => m.model === 'Apple Watch SE')!;
    expect(modelSearchText(watch)).toBe('Apple Watch SE');
  });
});

describe('suggest: lo que otras personas buscaron', () => {
  it('rellena con búsquedas populares que empiezan igual, las más buscadas primero', () => {
    const { suggestions } = run('lic', [
      { text: 'licuadora oster', hits: 3 },
      { text: 'licuadora ninja', hits: 9 },
      { text: 'lavadora', hits: 50 },
    ]);
    const popular = suggestions.filter((s) => s.kind === 'popular').map((s) => s.text);
    expect(popular.slice(0, 2)).toEqual(['licuadora ninja', 'licuadora oster']);
    expect(popular).not.toContain('lavadora');
  });

  it('un término popular igual a un modelo del catálogo no se repite', () => {
    const { suggestions } = run('iphone 15 p', [{ text: 'Apple iPhone 15 Pro', hits: 10 }]);
    expect(suggestions.filter((s) => s.text.toLowerCase() === 'apple iphone 15 pro')).toHaveLength(1);
  });

  it('ignora términos sin aciertos o demasiado cortos', () => {
    const { suggestions } = run('xy', [
      { text: 'xyz', hits: 0 },
      { text: 'xy', hits: 5 },
    ]);
    expect(suggestions).toEqual([]);
  });
});
