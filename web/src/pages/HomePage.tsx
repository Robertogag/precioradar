import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { SearchBox } from '../components/SearchBox.tsx';
import { ClockIcon } from '../components/icons.tsx';
import { writeSearchState, DEFAULT_SORT, EMPTY_FILTERS } from '../domain/filters.ts';
import { useT } from '../i18n/index.ts';
import { api } from '../lib/api.ts';
import { useSettings } from '../state/settings.ts';

/** Modelos y productos con los que vale la pena empezar: nombres que las tiendas de México indexan igual. */
const STARTERS = [
  'iPhone 16',
  'Samsung Galaxy S25',
  'PlayStation 5',
  'Nintendo Switch 2',
  'AirPods Pro 2',
  'MacBook Air M4',
  'Pantalla 55 pulgadas',
  'Freidora de aire',
  'Lavadora 20 kg',
  'Refrigerador 14 pies',
  'Licuadora Oster',
  'Xbox Series X',
];

export function searchUrl(q: string): string {
  return `/buscar?${writeSearchState({ q, sort: DEFAULT_SORT, includeAccessories: false, includeRefurbished: false, exact: false, filters: EMPTY_FILTERS })}`;
}

export function HomePage() {
  const { t, dict } = useT();
  const navigate = useNavigate();
  const country = useSettings((s) => s.country);
  const recent = useSettings((s) => s.recent);
  const clearRecent = useSettings((s) => s.clearRecent);
  const countries = useQuery({ queryKey: ['countries'], queryFn: ({ signal }) => api.countries(signal), staleTime: 60 * 60_000 });
  const mine = countries.data?.find((c) => c.code === country);

  return (
    <div className="wrap home">
      <section className="hero">
        <h1 className="hero__title">{t((d) => d.home.title)}</h1>
        <p className="hero__lead">
          {mine && mine.activeStores > 0 ? t((d) => d.home.lead, { n: mine.activeStores, country: mine.name }) : t((d) => d.home.leadNoCount)}
        </p>
        <SearchBox variant="hero" autoFocus onSubmit={(q) => navigate(searchUrl(q))} />
        <p className="hero__hint">{t((d) => d.search.hint)}</p>
      </section>

      {recent.length > 0 && (
        <section className="starters">
          <div className="starters__head">
            <h2 className="starters__title">
              <ClockIcon className="starters__icon" />
              {t((d) => d.home.recentTitle)}
            </h2>
            <button type="button" className="filters__link" onClick={clearRecent}>
              {t((d) => d.home.clearRecent)}
            </button>
          </div>
          <div className="chips">
            {recent.map((q) => (
              <button key={q} type="button" className="chip chip--quiet" onClick={() => navigate(searchUrl(q))}>
                {q}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="starters">
        <h2 className="starters__title">{t((d) => d.home.startersTitle)}</h2>
        <div className="chips">
          {STARTERS.map((q) => (
            <button key={q} type="button" className="chip chip--quiet" onClick={() => navigate(searchUrl(q))}>
              {q}
            </button>
          ))}
        </div>
      </section>

      <section className="steps">
        <h2 className="starters__title">{t((d) => d.home.howTitle)}</h2>
        <ol className="steps__list">
          {dict.home.how.map((step, i) => (
            <li key={step.t} className="step">
              <span className="step__n" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="step__t">{step.t}</h3>
              <p className="step__d">{step.d}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
