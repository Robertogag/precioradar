import { useWindowDimensions } from 'react-native';

/** Cómo se acomoda la app según el ancho: celular, tableta o computadora. */
export function useLayout() {
  const { width } = useWindowDimensions();
  return {
    width,
    /** Computadora o tableta horizontal: navegación arriba y contenido en varias columnas. */
    wide: width >= 900,
    gutter: width >= 600 ? 28 : 16,
    maxWidth: 1240,
    resultColumns: width >= 1040 ? 2 : 1,
    dealColumns: width >= 1280 ? 5 : width >= 1000 ? 4 : width >= 660 ? 3 : 2,
  };
}

/** Rellena con huecos la última fila de una cuadrícula para que sus tarjetas no se estiren. */
export function padToColumns<T>(items: T[], columns: number): (T | null)[] {
  const rest = items.length % columns;
  return rest === 0 ? items : [...items, ...Array<null>(columns - rest).fill(null)];
}
