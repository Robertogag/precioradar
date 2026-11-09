import { useEffect, useState } from 'react';

/** El valor, pero solo después de `ms` sin cambios: para no pedir sugerencias en cada tecla. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
