import { storeBrand, storeInitials } from '../lib/store-brand.ts';
import { STORE_LOGOS } from '../lib/store-logos.ts';

interface Props {
  id: string;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * La tienda de un vistazo: su logotipo oficial (el icono que publica en su propio sitio) sobre fondo blanco.
 * Si no hay logotipo, su inicial sobre su color.
 */
export function StoreMark({ id, name, size = 'md' }: Props) {
  if (STORE_LOGOS.has(id)) {
    return (
      <span className={`mark mark--${size} mark--logo`} aria-hidden="true">
        <img className="mark__img" src={`/stores/${id}.png`} alt="" loading="lazy" decoding="async" />
      </span>
    );
  }
  const brand = storeBrand(id);
  return (
    <span className={`mark mark--${size}`} style={{ background: brand.bg, color: brand.fg }} aria-hidden="true">
      {storeInitials(name)}
    </span>
  );
}
