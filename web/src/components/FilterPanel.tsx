import { type KeyboardEvent, useEffect, useMemo, useState } from 'react';
import type { ProductGroup } from '../../../shared/contracts.ts';
import { EMPTY_FILTERS, type Filters, type SearchState, activeFilterCount, priceBounds, storeCounts } from '../domain/filters.ts';
import { useT } from '../i18n/index.ts';
import { money } from '../lib/format.ts';
import { StoreMark } from './StoreMark.tsx';

interface Props {
  state: SearchState;
  onChange: (next: SearchState) => void;
  /** Grupos tal como llegaron del servidor (sin filtrar): de aquí salen las tiendas y el rango de precios. */
  groups: ProductGroup[];
  hiddenAccessories: number;
  hiddenRefurbished: number;
  hiddenInexact: number;
  currency: string;
}

function parsePrice(text: string): number | null {
  const clean = text.replace(/[^\d.]/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function Switch({ checked, onChange, label, note }: { checked: boolean; onChange: (v: boolean) => void; label: string; note?: string }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" className="switch__input" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch__track" aria-hidden="true" />
      <span className="switch__text">
        {label}
        {note && <span className="switch__note">{note}</span>}
      </span>
    </label>
  );
}

/** Filtros de la página de resultados. Cambian la URL; no vuelven a consultar a las tiendas salvo accesorios/reacondicionados. */
export function FilterPanel({ state, onChange, groups, hiddenAccessories, hiddenRefurbished, hiddenInexact, currency }: Props) {
  const { t, locale } = useT();
  const f = state.filters;
  const counts = useMemo(() => storeCounts(groups), [groups]);
  const bounds = useMemo(() => priceBounds(groups), [groups]);
  const allIds = counts.map((c) => c.id);
  const selected = f.stores.length === 0 ? allIds : f.stores;

  const setFilters = (patch: Partial<Filters>) => onChange({ ...state, filters: { ...f, ...patch } });

  const toggleStore = (id: string) => {
    const next = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
    // Todas marcadas (o ninguna) = sin filtro de tienda.
    setFilters({ stores: next.length === 0 || next.length >= allIds.length ? [] : next });
  };

  const [minText, setMinText] = useState(f.min?.toString() ?? '');
  const [maxText, setMaxText] = useState(f.max?.toString() ?? '');
  useEffect(() => setMinText(f.min?.toString() ?? ''), [f.min]);
  useEffect(() => setMaxText(f.max?.toString() ?? ''), [f.max]);

  const commitPrice = () => {
    let min = parsePrice(minText);
    let max = parsePrice(maxText);
    if (min !== null && max !== null && min > max) [min, max] = [max, min];
    if (min !== f.min || max !== f.max) setFilters({ min, max });
  };
  const onPriceKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitPrice();
    }
  };

  return (
    <div className="filters">
      <section className="filters__section">
        <div className="filters__head">
          <h3 className="filters__title">{t((d) => d.filters.stores)}</h3>
          {f.stores.length > 0 && (
            <button type="button" className="filters__link" onClick={() => setFilters({ stores: [] })}>
              {t((d) => d.filters.all)}
            </button>
          )}
        </div>
        <ul className="checks">
          {counts.map((s) => (
            <li key={s.id} className="check">
              <label className="check__label">
                <input type="checkbox" className="check__box" checked={selected.includes(s.id)} onChange={() => toggleStore(s.id)} />
                <StoreMark id={s.id} name={s.name} size="sm" />
                <span className="check__name">{s.name}</span>
                <span className="check__count">{s.count}</span>
              </label>
              <button type="button" className="check__only" onClick={() => setFilters({ stores: [s.id] })}>
                {t((d) => d.filters.onlyThis)}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="filters__section">
        <h3 className="filters__title">{t((d) => d.filters.price)}</h3>
        <div className="range">
          <label className="range__field">
            <span className="range__label">{t((d) => d.filters.min)}</span>
            <input
              className="range__input"
              inputMode="numeric"
              placeholder={bounds ? money(bounds.min, currency, locale) : ''}
              value={minText}
              onChange={(e) => setMinText(e.target.value)}
              onBlur={commitPrice}
              onKeyDown={onPriceKey}
            />
          </label>
          <span className="range__dash" aria-hidden="true">
            –
          </span>
          <label className="range__field">
            <span className="range__label">{t((d) => d.filters.max)}</span>
            <input
              className="range__input"
              inputMode="numeric"
              placeholder={bounds ? money(bounds.max, currency, locale) : ''}
              value={maxText}
              onChange={(e) => setMaxText(e.target.value)}
              onBlur={commitPrice}
              onKeyDown={onPriceKey}
            />
          </label>
        </div>
      </section>

      <section className="filters__section filters__section--switches">
        <Switch
          checked={state.exact}
          onChange={(v) => onChange({ ...state, exact: v })}
          label={t((d) => d.filters.exact)}
          note={state.exact && hiddenInexact > 0 ? t((d) => d.filters.hiddenVariants, { n: hiddenInexact }) : undefined}
        />
        <Switch checked={f.onlyDiscount} onChange={(v) => setFilters({ onlyDiscount: v })} label={t((d) => d.filters.onlyDiscount)} />
        <Switch checked={f.onlyMultiStore} onChange={(v) => setFilters({ onlyMultiStore: v })} label={t((d) => d.filters.onlyMultiStore)} />
        <Switch
          checked={state.includeAccessories}
          onChange={(v) => onChange({ ...state, includeAccessories: v })}
          label={t((d) => d.filters.accessories)}
          note={hiddenAccessories > 0 ? t((d) => d.filters.hiddenCount, { n: hiddenAccessories }) : undefined}
        />
        <Switch
          checked={state.includeRefurbished}
          onChange={(v) => onChange({ ...state, includeRefurbished: v })}
          label={t((d) => d.filters.refurbished)}
          note={hiddenRefurbished > 0 ? t((d) => d.filters.hiddenCount, { n: hiddenRefurbished }) : undefined}
        />
      </section>

      {activeFilterCount(f) > 0 && (
        <button type="button" className="btn btn--ghost filters__reset" onClick={() => setFilters(EMPTY_FILTERS)}>
          {t((d) => d.results.resetFilters)}
        </button>
      )}
    </div>
  );
}
