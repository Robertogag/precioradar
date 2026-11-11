import { describe, expect, it } from 'vitest';
import { lineSplitter } from './ndjson.ts';

describe('lector de líneas JSON (búsqueda en dos tandas)', () => {
  it('entrega cada línea completa aunque llegue partida en varios pedazos', () => {
    const got: unknown[] = [];
    const split = lineSplitter((v) => got.push(v));
    split.push('{"a":1}\n{"b"');
    expect(got).toEqual([{ a: 1 }]);
    split.push(':2}\n');
    split.push('{"c":3}');
    expect(got).toEqual([{ a: 1 }, { b: 2 }]);
    split.end();
    expect(got).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it('ignora líneas vacías y espacios al final', () => {
    const got: unknown[] = [];
    const split = lineSplitter((v) => got.push(v));
    split.push('\n{"a":1}\n\n  \n');
    split.end();
    expect(got).toEqual([{ a: 1 }]);
  });
});
