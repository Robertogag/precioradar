import type { CountryInfo, StoreInfo } from '../../../../shared/contracts.ts';

const MX_STATES: [string, string][] = [
  ['AGU', 'Aguascalientes'], ['BCN', 'Baja California'], ['BCS', 'Baja California Sur'], ['CAM', 'Campeche'],
  ['CHP', 'Chiapas'], ['CHH', 'Chihuahua'], ['CMX', 'Ciudad de México'], ['COA', 'Coahuila'], ['COL', 'Colima'],
  ['DUR', 'Durango'], ['GUA', 'Guanajuato'], ['GRO', 'Guerrero'], ['HID', 'Hidalgo'], ['JAL', 'Jalisco'],
  ['MEX', 'Estado de México'], ['MIC', 'Michoacán'], ['MOR', 'Morelos'], ['NAY', 'Nayarit'], ['NLE', 'Nuevo León'],
  ['OAX', 'Oaxaca'], ['PUE', 'Puebla'], ['QUE', 'Querétaro'], ['ROO', 'Quintana Roo'], ['SLP', 'San Luis Potosí'],
  ['SIN', 'Sinaloa'], ['SON', 'Sonora'], ['TAB', 'Tabasco'], ['TAM', 'Tamaulipas'], ['TLA', 'Tlaxcala'],
  ['VER', 'Veracruz'], ['YUC', 'Yucatán'], ['ZAC', 'Zacatecas'],
];

/**
 * Países que la app ofrece. Agregar un país = agregarlo aquí y registrar sus tiendas con ese `country`.
 * El resto del sistema (búsqueda, agrupado, app) ya es por país.
 */
const COUNTRIES: Omit<CountryInfo, 'activeStores'>[] = [
  {
    code: 'MX',
    name: 'México',
    currency: 'MXN',
    locale: 'es-MX',
    states: MX_STATES.map(([code, name]) => ({ code, name })),
  },
];

export function listCountries(stores: StoreInfo[]): CountryInfo[] {
  return COUNTRIES.map((c) => ({
    ...c,
    activeStores: stores.filter((s) => s.country === c.code && s.availability === 'activa').length,
  }));
}

export function isKnownCountry(code: string): boolean {
  return COUNTRIES.some((c) => c.code === code);
}

export function isKnownState(country: string, state: string): boolean {
  return COUNTRIES.find((c) => c.code === country)?.states.some((s) => s.code === state) ?? false;
}
