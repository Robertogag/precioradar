import { describe, expect, it } from 'vitest';
import { en } from './en.ts';
import { es } from './es.ts';
import { interpolate, makeT } from './index.ts';

type Tree = Record<string, unknown>;

function leaves(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out.set(path, value);
    else if (Array.isArray(value)) value.forEach((item, i) => leaves(item as Tree, `${path}[${i}]`).forEach((v, k) => out.set(k, v)));
    else if (typeof value === 'object' && value !== null) leaves(value as Tree, path).forEach((v, k) => out.set(k, v));
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('diccionarios', () => {
  it('inglés tiene exactamente las mismas llaves que español', () => {
    expect([...leaves(en as Tree).keys()].sort()).toEqual([...leaves(es as Tree).keys()].sort());
  });

  it('cada texto usa los mismos {huecos} en los dos idiomas y ninguno queda vacío', () => {
    const a = leaves(es as Tree);
    const b = leaves(en as Tree);
    for (const [key, text] of a) {
      expect(text.trim(), key).not.toBe('');
      expect(placeholders(b.get(key) ?? ''), key).toEqual(placeholders(text));
    }
  });

  it('interpola y pluraliza', () => {
    expect(interpolate('{n} tiendas de {country}', { n: 12, country: 'México' })).toBe('12 tiendas de México');
    expect(interpolate('sin {hueco}', {})).toBe('sin {hueco}');
    const es1 = makeT('es');
    expect(es1.tn((d) => d.storeRun.count, 1)).toBe('1 precio');
    expect(es1.tn((d) => d.storeRun.count, 4)).toBe('4 precios');
    expect(makeT('en').t((d) => d.results.title, { q: 'tv' })).toBe('Results for “tv”');
    expect(makeT('en').locale).toBe('en-US');
  });
});
