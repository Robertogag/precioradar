import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { SortMode } from '../../../shared/contracts';

interface Settings {
  /** Falso hasta que se leyó lo guardado en el teléfono; evita enseñar la bienvenida a quien ya eligió país. */
  hydrated: boolean;
  country: string | null;
  state: string | null;
  /** Dirección del servidor escrita a mano; vacío = detectarla sola. */
  serverUrl: string;
  sort: SortMode;
  includeAccessories: boolean;
  includeRefurbished: boolean;
  /** Solo el producto exacto: sin variantes que no se escribieron (Pro, Ultra, Plus…). */
  exact: boolean;
  recent: string[];
  /** Compartir con los demás el precio que Mercado Libre le muestra a esta persona al abrirlo en la app. null = no se le ha preguntado. */
  shareSeen: boolean | null;
  setShareSeen: (value: boolean) => void;
  setPlace: (country: string, state: string | null) => void;
  setServerUrl: (url: string) => void;
  setSort: (sort: SortMode) => void;
  toggleAccessories: () => void;
  toggleRefurbished: () => void;
  toggleExact: () => void;
  remember: (query: string) => void;
  forgetRecent: () => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      hydrated: false,
      country: null,
      state: null,
      serverUrl: '',
      sort: 'relevancia',
      includeAccessories: false,
      includeRefurbished: false,
      exact: false,
      recent: [],
      shareSeen: null,
      setShareSeen: (shareSeen) => set({ shareSeen }),
      setPlace: (country, state) => set({ country, state }),
      setServerUrl: (serverUrl) => set({ serverUrl: serverUrl.trim().replace(/\/+$/, '') }),
      setSort: (sort) => set({ sort }),
      toggleAccessories: () => set((s) => ({ includeAccessories: !s.includeAccessories })),
      toggleRefurbished: () => set((s) => ({ includeRefurbished: !s.includeRefurbished })),
      toggleExact: () => set((s) => ({ exact: !s.exact })),
      remember: (query) =>
        set((s) => ({
          recent: [query, ...s.recent.filter((r) => r.toLowerCase() !== query.toLowerCase())].slice(0, 8),
        })),
      forgetRecent: () => set({ recent: [] }),
    }),
    {
      name: 'comparador-ajustes-v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ hydrated: _hydrated, ...rest }) => rest,
      onRehydrateStorage: () => () => useSettings.setState({ hydrated: true }),
    },
  ),
);
