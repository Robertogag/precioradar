import { Link, NavLink, useLocation } from 'react-router';
import { LANGS, useT } from '../i18n/index.ts';
import { useResolvedTheme, useSettings } from '../state/settings.ts';
import { MoonIcon, SearchIcon, SettingsIcon, StoreIcon, SunIcon, TagIcon } from './icons.tsx';

export function TopBar() {
  const { t, lang } = useT();
  const setLang = useSettings((s) => s.setLang);
  const setTheme = useSettings((s) => s.setTheme);
  const country = useSettings((s) => s.country);
  const resolved = useResolvedTheme();
  const { pathname } = useLocation();
  const onSearch = pathname === '/' || pathname.startsWith('/buscar');

  const links = [
    { to: '/', label: t((d) => d.nav.search), icon: SearchIcon, active: onSearch },
    { to: '/descuentos', label: t((d) => d.nav.deals), icon: TagIcon, active: pathname.startsWith('/descuentos') },
    { to: '/tiendas', label: t((d) => d.nav.stores), icon: StoreIcon, active: pathname.startsWith('/tiendas') },
    { to: '/ajustes', label: t((d) => d.nav.settings), icon: SettingsIcon, active: pathname.startsWith('/ajustes') },
  ];
  const next = resolved === 'dark' ? 'light' : 'dark';

  return (
    <header className="top">
      <div className="wrap top__inner">
        <Link to="/" className="brand">
          <img className="brand__mark" src="/brand/mark.png" alt="" width={30} height={30} decoding="async" />
          <span className="brand__name">
            Precio<span className="brand__name--accent">Radar</span>
          </span>
        </Link>

        <nav className="nav" aria-label={t((d) => d.nav.main)}>
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={`nav__link${l.active ? ' is-active' : ''}`} aria-current={l.active ? 'page' : undefined}>
              <l.icon className="nav__icon" />
              <span>{l.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="top__tools">
          <button
            type="button"
            className="theme-btn"
            onClick={() => setTheme(next)}
            title={next === 'dark' ? t((d) => d.nav.themeDark) : t((d) => d.nav.themeLight)}
            aria-label={next === 'dark' ? t((d) => d.nav.themeDark) : t((d) => d.nav.themeLight)}>
            {resolved === 'dark' ? <SunIcon width={18} height={18} /> : <MoonIcon width={18} height={18} />}
          </button>
          <Link to="/ajustes" className="country" title={t((d) => d.settings.country)}>
            {country}
          </Link>
          <div className="lang" role="group" aria-label={t((d) => d.nav.language)}>
            {LANGS.map((l) => (
              <button key={l} type="button" className={`lang__btn${l === lang ? ' is-active' : ''}`} aria-pressed={l === lang} onClick={() => setLang(l)}>
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
}
