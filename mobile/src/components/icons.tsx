import Svg, { Circle, Line, Path, Polyline } from 'react-native-svg';

import { colors } from '@/theme';

export type IconName =
  | 'search'
  | 'percent'
  | 'bag'
  | 'sliders'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-up'
  | 'arrow-up-right'
  | 'arrow-right'
  | 'x'
  | 'clock'
  | 'check'
  | 'pin'
  | 'trending-down'
  | 'alert'
  | 'refresh';

/** Iconos de trazo (familia Feather, licencia MIT) dibujados como vector: nítidos a cualquier tamaño. */
export function Icon({ name, size = 20, color = colors.ink, strokeWidth = 2 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {GLYPHS[name]}
    </Svg>
  );
}

const GLYPHS: Record<IconName, React.ReactNode> = {
  search: (
    <>
      <Circle cx="11" cy="11" r="8" />
      <Line x1="21" y1="21" x2="16.65" y2="16.65" />
    </>
  ),
  percent: (
    <>
      <Line x1="19" y1="5" x2="5" y2="19" />
      <Circle cx="6.5" cy="6.5" r="2.5" />
      <Circle cx="17.5" cy="17.5" r="2.5" />
    </>
  ),
  bag: (
    <>
      <Path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <Line x1="3" y1="6" x2="21" y2="6" />
      <Path d="M16 10a4 4 0 0 1-8 0" />
    </>
  ),
  sliders: (
    <>
      <Line x1="4" y1="21" x2="4" y2="14" />
      <Line x1="4" y1="10" x2="4" y2="3" />
      <Line x1="12" y1="21" x2="12" y2="12" />
      <Line x1="12" y1="8" x2="12" y2="3" />
      <Line x1="20" y1="21" x2="20" y2="16" />
      <Line x1="20" y1="12" x2="20" y2="3" />
      <Line x1="1" y1="14" x2="7" y2="14" />
      <Line x1="9" y1="8" x2="15" y2="8" />
      <Line x1="17" y1="16" x2="23" y2="16" />
    </>
  ),
  'chevron-right': <Polyline points="9 18 15 12 9 6" />,
  'chevron-down': <Polyline points="6 9 12 15 18 9" />,
  'chevron-up': <Polyline points="18 15 12 9 6 15" />,
  'arrow-up-right': (
    <>
      <Line x1="7" y1="17" x2="17" y2="7" />
      <Polyline points="7 7 17 7 17 17" />
    </>
  ),
  'arrow-right': (
    <>
      <Line x1="5" y1="12" x2="19" y2="12" />
      <Polyline points="12 5 19 12 12 19" />
    </>
  ),
  x: (
    <>
      <Line x1="18" y1="6" x2="6" y2="18" />
      <Line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
  clock: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Polyline points="12 6 12 12 16 14" />
    </>
  ),
  check: <Polyline points="20 6 9 17 4 12" />,
  pin: (
    <>
      <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <Circle cx="12" cy="10" r="3" />
    </>
  ),
  'trending-down': (
    <>
      <Polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <Polyline points="17 18 23 18 23 12" />
    </>
  ),
  alert: (
    <>
      <Circle cx="12" cy="12" r="10" />
      <Line x1="12" y1="8" x2="12" y2="12" />
      <Line x1="12" y1="16" x2="12.01" y2="16" />
    </>
  ),
  refresh: (
    <>
      <Polyline points="23 4 23 10 17 10" />
      <Path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </>
  ),
};
