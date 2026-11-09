import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Lang, detectLang, isLang } from '../i18n/lang.ts';

const MAX_RECENT = 8;
const MAX_QUERY = 120;

/** Tema de la interfaz: el del sistema, o el que la persona eligió. */
export type Theme = 'system' | 'light' | 'dark';
const THEMES: readonly Theme[] = ['system', 'light', 'dark'];
export const isTheme = (v: unknown): v is Theme => typeof v === 'string' && (THEMES as readonly string[]).includes(v);

export interface SettingsState {
  lang: Lang;
  theme: Theme;
  country: string;
  state: string | null;
  /** Búsquedas de este navegador, la más nueva primero. */
  recent: string[];
  setLang(lang: Lang): void;
  setTheme(theme: Theme): void;
  setCountry(country: string): void;
  setState(state: string | null): void;
  addRecent(query: string): void;
  removeRecent(query: string): void;
  clearRecent(): void;
}

type Persisted = Pick<SettingsState, 'lang' | 'theme' | 'country' | 'state' | 'recent'>;

const COUNTRY = /^[A-Z]{2}$/;
const STATE = /^[A-Z]{2,5}$/;

/** Lo guardado en el navegador lo puede editar cualquiera: se valida antes de usarse. */
export function sanitize(raw: unknown): Partial<Persisted> {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<Persisted> = {};
  if (isLang(r.lang)) out.lang = r.lang;
  if (isTheme(r.theme)) out.theme = r.theme;
  if (typeof r.country === 'string' && COUNTRY.test(r.country)) out.country = r.country;
  if (r.state === null) out.state = null;
  else if (typeof r.state === 'string' && STATE.test(r.state)) out.state = r.state;
  if (Array.isArray(r.recent)) {
    out.recent = r.recent
      .filter((q): q is string => typeof q === 'string')
      .map((q) => q.trim().slice(0, MAX_QUERY))
      .filter((q) => q.length >= 2)
      .slice(0, MAX_RECENT);
  }
  return out;
}

/** El tema que se ve: el elegido, o el del sistema cuando está en "system" (y cambia si el sistema cambia). */
export function useResolvedTheme(): 'light' | 'dark' {
  const theme = useSettings((s) => s.theme);
  const [systemDark, setSystemDark] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      lang: detectLang(),
      theme: 'system',
      country: 'MX',
      state: null,
      recent: [],
      setLang: (lang) => set({ lang }),
      setTheme: (theme) => set({ theme }),
      setCountry: (country) => set({ country, state: null }),
      setState: (state) => set({ state }),
      addRecent: (query) =>
        set((s) => {
          const clean = query.trim().replace(/\s+/g, ' ').slice(0, MAX_QUERY);
          if (clean.length < 2) return s;
          const rest = s.recent.filter((r) => r.toLowerCase() !== clean.toLowerCase());
          return { recent: [clean, ...rest].slice(0, MAX_RECENT) };
        }),
      removeRecent: (query) => set((s) => ({ recent: s.recent.filter((r) => r !== query) })),
      clearRecent: () => set({ recent: [] }),
    }),
    {
      name: 'comparador-web',
      version: 1,
      partialize: (s): Persisted => ({ lang: s.lang, theme: s.theme, country: s.country, state: s.state, recent: s.recent }),
      merge: (persisted, current) => ({ ...current, ...sanitize(persisted) }),
    },
  ),
);
