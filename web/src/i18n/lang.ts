export type Lang = 'es' | 'en';

export const LANGS: readonly Lang[] = ['es', 'en'];

export function isLang(value: unknown): value is Lang {
  return value === 'es' || value === 'en';
}

/** Español salvo que el navegador esté en inglés. El usuario lo cambia cuando quiera y se recuerda. */
export function detectLang(): Lang {
  try {
    return (navigator.language ?? 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
  } catch {
    return 'es';
  }
}

export function localeOf(lang: Lang): string {
  return lang === 'es' ? 'es-MX' : 'en-US';
}
