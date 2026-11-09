import { type RefObject, useEffect, useRef, useState } from 'react';

/**
 * ¿El elemento está en pantalla o a punto de entrar? Para pedir datos secundarios (el enlace a Mercado Libre de cada
 * tarjeta) solo cuando hacen falta, y no cincuenta de golpe al cargar la búsqueda. Una vez cerca, se queda en true.
 */
export function useNearViewport<T extends Element>(margin = '400px 0px'): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [near, margin]);
  return [ref, near];
}
