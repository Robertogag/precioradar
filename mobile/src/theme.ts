/**
 * Sistema de diseño PrecioRadar (kit de marca del 7-nov-2026, carpeta "visual aid").
 * Azul profundo para la tinta, verde radar para la acción y el ahorro, azul tech para la interfaz,
 * verde menta para resaltar, amarillo para la oferta.
 */
export const colors = {
  bg: '#F5F7FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF2F6',
  tint: '#EAF2FF',
  line: '#E5E7EB',

  /** Azul profundo #0B2545: titulares y texto principal. */
  ink: '#0B2545',
  inkSoft: '#44546A',
  inkFaint: '#8793A6',

  /** Azul tech: enlaces, iconos activos, bordes de foco. En texto pequeño se usa un tono más oscuro para que se lea. */
  brand: '#2563EB',
  brandDeep: '#1D4ED8',
  brandFill: '#3B82F6',
  /** Verde radar: la acción principal y el éxito. Encima va blanco. */
  accent: '#22C55E',
  accentDeep: '#16A34A',
  /** Verde menta: resaltado ("Mejor precio"). */
  accentSoft: '#A7F3D0',
  onAccent: '#FFFFFF',

  save: '#15803D',
  saveBar: '#22C55E',
  saveSoft: '#DCFCE7',
  saveInk: '#065F46',

  /** Amarillo oferta: la rebaja. */
  deal: '#92400E',
  dealFill: '#FACC15',
  dealSoft: '#FEF3C7',

  warn: '#B45309',
  warnSoft: '#FEF3C7',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',

  track: '#E5E7EB',
  bar: '#CBD5E1',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

export const family = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const type = {
  overline: { fontFamily: family.bold, fontSize: 11, lineHeight: 14, letterSpacing: 0.9, textTransform: 'uppercase' },
  caption: { fontFamily: family.medium, fontSize: 12, lineHeight: 16 },
  small: { fontFamily: family.medium, fontSize: 13, lineHeight: 18 },
  body: { fontFamily: family.medium, fontSize: 15, lineHeight: 22 },
  label: { fontFamily: family.semibold, fontSize: 15, lineHeight: 21 },
  heading: { fontFamily: family.bold, fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  title: { fontFamily: family.extrabold, fontSize: 24, lineHeight: 30, letterSpacing: -0.5 },
  price: { fontFamily: family.extrabold, fontSize: 27, lineHeight: 32, letterSpacing: -0.6 },
  display: { fontFamily: family.extrabold, fontSize: 34, lineHeight: 40, letterSpacing: -1 },
} as const;

/** Sombras suaves en vez de bordes: dan profundidad sin ensuciar. */
export const shadow = {
  card: { boxShadow: '0 1px 2px rgba(11,37,69,0.05), 0 6px 16px rgba(11,37,69,0.06)' },
  raised: { boxShadow: '0 2px 4px rgba(11,37,69,0.06), 0 14px 32px rgba(11,37,69,0.12)' },
  field: { boxShadow: '0 1px 2px rgba(11,37,69,0.05), 0 10px 28px rgba(59,130,246,0.22)' },
} as const;

/** Los precios se alinean en columna: cifras de ancho fijo. */
export const tabular = { fontVariant: ['tabular-nums' as const] };

export const brand = {
  name: 'PrecioRadar',
  /** Las dos partes del nombre llevan colores distintos, como en el logotipo. */
  nameParts: ['Precio', 'Radar'] as const,
  tagline: 'Compara precios. Decide mejor.',
} as const;
