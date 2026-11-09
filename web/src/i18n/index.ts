import { useMemo } from 'react';
import { useSettings } from '../state/settings.ts';
import { en } from './en.ts';
import { type Dict, es } from './es.ts';
import { type Lang, localeOf } from './lang.ts';

export type { Dict } from './es.ts';
export type { Lang } from './lang.ts';
export { LANGS, detectLang, localeOf } from './lang.ts';

export const DICTS: Record<Lang, Dict> = { es, en };

export type Vars = Record<string, string | number>;
export interface Plural {
  one: string;
  many: string;
}

/** "{n} tiendas" + {n: 3} → "3 tiendas". Una llave sin valor se deja tal cual para que se note. */
export function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/**
 * Traductor de un idioma. Las llaves se piden con una función (`t((d) => d.nav.search)`) para que el compilador
 * avise si la llave no existe, sin cadenas mágicas.
 */
export function makeT(lang: Lang) {
  const dict = DICTS[lang];
  const t = (pick: (d: Dict) => string, vars?: Vars): string => interpolate(pick(dict), vars);
  const tn = (pick: (d: Dict) => Plural, n: number, vars?: Vars): string =>
    interpolate(n === 1 ? pick(dict).one : pick(dict).many, { n, ...vars });
  return { lang, dict, t, tn, locale: localeOf(lang) };
}

export type T = ReturnType<typeof makeT>;

export function useT(): T {
  const lang = useSettings((s) => s.lang);
  return useMemo(() => makeT(lang), [lang]);
}
