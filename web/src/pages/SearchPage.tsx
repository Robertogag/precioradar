import { keepPreviousData, skipToken, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import type { SearchResponse, SortMode } from '../../../shared/contracts.ts';
import { FilterPanel } from '../components/FilterPanel.tsx';
import { ProductCard } from '../components/ProductCard.tsx';
import { SearchBox } from '../components/SearchBox.tsx';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States.tsx';
import { StoreRunList } from '../components/StoreRunList.tsx';
import { CloseIcon, FilterIcon } from '../components/icons.tsx';
import { EMPTY_FILTERS, type SearchState, activeFilterCount, applyFilters, readSearchState, writeSearchState } from '../domain/filters.ts';
import { useT } from '../i18n/index.ts';
import { api } from '../lib/api.ts';
import { ago, integer } from '../lib/format.ts';
import { useMediaQuery } from '../lib/hooks.ts';
import { useSettings } from '../state/settings.ts';

const SORTS: SortMode[] = ['relevancia', 'precio', 'descuento'];

/** "Coppel y Sears" / "Coppel and Sears", como se dice en el idioma de la app. */
function listFormat(items: string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(items);
  } catch {
    return items.join(', ');
  }
}

export function SearchPage() {
  const { t, locale } = useT();
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const state = useMemo(() => readSearchState(sp), [sp]);
  const country = useSettings((s) => s.country);
  const stateCode = useSettings((s) => s.state);
  const addRecent = useSettings((s) => s.addRecent);
  const wide = useMediaQuery('(min-width: 960px)');
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetRef = useRef<HTMLDialogElement>(null);

  const q = state.q;
  const queryClient = useQueryClient();
  const searchKey = ['search', country, stateCode, q, state.sort, state.includeAccessories, state.includeRefurbished, state.exact] as const;
  // Primera tanda de la búsqueda (tiendas rápidas) mientras Coppel y Sears terminan: vive en su propia entrada de
  // caché y se enseña solo hasta que llega la respuesta completa.
  const earlyKey = ['search-early', ...searchKey] as const;
  const search = useQuery({
    queryKey: searchKey,
    queryFn: ({ signal }) =>
      api.searchInTwoBatches(
        {
          query: q,
          country,
          state: stateCode,
          sort: state.sort,
          includeAccessories: state.includeAccessories,
          includeRefurbished: state.includeRefurbished,
          exact: state.exact,
        },
        (early) => queryClient.setQueryData(earlyKey, early),
        signal,
      ),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const early = useQuery<SearchResponse>({ queryKey: earlyKey, queryFn: skipToken, staleTime: Infinity });
  const related = useQuery({
    queryKey: ['suggest', country, q],
    queryFn: ({ signal }) => api.suggest(q, country, signal),
    enabled: q.length >= 2,
    staleTime: 5 * 60_000,
    retry: false,
  });

  useEffect(() => {
    if (search.data && search.data.query === q) addRecent(q);
  }, [search.data, q, addRecent]);

  useEffect(() => {
    document.title = q ? `${q} · ${t((d) => d.app.title)}` : t((d) => d.app.title);
  }, [q, t]);

  useEffect(() => {
    const dialog = sheetRef.current;
    if (!dialog) return;
    if (sheetOpen && !dialog.open) dialog.showModal();
    if (!sheetOpen && dialog.open) dialog.close();
  }, [sheetOpen]);
  useEffect(() => {
    if (wide) setSheetOpen(false);
  }, [wide]);

  // Mientras la respuesta completa no llega (o lo que hay es la búsqueda anterior), la primera tanda manda.
  const showEarly = early.data !== undefined && !search.isError && (search.data === undefined || search.isPlaceholderData);
  const data = showEarly ? early.data : search.data;
  const groups = useMemo(() => (data ? applyFilters(data.groups, state.filters) : []), [data, state.filters]);
  const activeCount = activeFilterCount(state.filters);
  const stale = data !== undefined && data.query !== q;
  const pendingStores = data?.partial ? data.stores.filter((s) => s.status === 'pendiente').map((s) => s.storeName) : [];
  const refreshing = search.isFetching && !data?.partial;

  if (q.length < 2) return <Navigate to="/" replace />;

  const update = (next: SearchState) => setSp(writeSearchState(next), { replace: true });
  const newSearch = (nq: string) => navigate(`/buscar?${writeSearchState({ ...state, q: nq, filters: EMPTY_FILTERS })}`);

  const panel = data && (
    <FilterPanel
      state={state}
      onChange={update}
      groups={data.groups}
      hiddenAccessories={data.hiddenAccessories}
      hiddenRefurbished={data.hiddenRefurbished}
      hiddenInexact={data.hiddenInexact}
      currency={data.groups[0]?.best.currency ?? 'MXN'}
    />
  );

  return (
    <div className="wrap results">
      <div className="results__search">
        <SearchBox initial={q} onSubmit={newSearch} />
      </div>

      <header className="results__head">
        <h1 className="results__title">{t((d) => d.results.title, { q })}</h1>
        {data && !stale && (
          <p className="results__meta">
            {t((d) => d.results.summary, {
              products: integer(groups.length, locale),
              offers: integer(data.totalOffers, locale),
              stores: data.stores.filter((s) => s.status === 'ok').length,
            })}
            <span className="results__ago"> · {t((d) => d.results.cached, { ago: ago(data.generatedAt, locale) })}</span>
          </p>
        )}
        {pendingStores.length > 0 && !stale && (
          <p className="results__pending" role="status">
            <span className="results__pending-dot" aria-hidden="true" />
            {t((d) => d.results.pending, { stores: listFormat(pendingStores, locale) })}
          </p>
        )}
      </header>

      {related.data && related.data.related.length > 0 && (
        <div className="related">
          <span className="related__label">{t((d) => d.results.related)}</span>
          <div className="chips chips--scroll">
            {related.data.related.map((r) => (
              <button key={r.text} type="button" className="chip chip--sm" onClick={() => newSearch(r.text)}>
                {r.text}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="results__layout">
        {wide && <aside className="results__aside">{panel}</aside>}

        <section className="results__main" aria-busy={search.isFetching}>
          <div className="results__bar">
            <div className="seg" role="group" aria-label={t((d) => d.results.sort.label)}>
              {SORTS.map((s) => (
                <button key={s} type="button" className={`seg__btn${state.sort === s ? ' is-on' : ''}`} aria-pressed={state.sort === s} onClick={() => update({ ...state, sort: s })}>
                  {t((d) => d.results.sort[s])}
                </button>
              ))}
            </div>
            {!wide && data && (
              <button type="button" className="btn btn--ghost results__filters" onClick={() => setSheetOpen(true)}>
                <FilterIcon width={18} height={18} />
                {t((d) => d.filters.open)}
                {activeCount > 0 && <span className="results__filters-n">{t((d) => d.filters.active, { n: activeCount })}</span>}
              </button>
            )}
          </div>

          {search.isError && !data ? (
            <ErrorState error={search.error} onRetry={() => void search.refetch()} />
          ) : !data || stale ? (
            <>
              <p className="results__loading">
                {t((d) => d.results.loadingAny)}
                <span className="results__loading-sub">{t((d) => d.results.loadingSub)}</span>
              </p>
              <CardSkeletons />
            </>
          ) : data.groups.length === 0 ? (
            <EmptyState title={t((d) => d.results.none, { q })} text={t((d) => d.results.noneHint)} />
          ) : groups.length === 0 ? (
            <EmptyState
              title={t((d) => d.results.noneFiltered)}
              action={
                <button type="button" className="btn btn--primary" onClick={() => update({ ...state, filters: EMPTY_FILTERS })}>
                  {t((d) => d.results.resetFilters)}
                </button>
              }
            />
          ) : (
            <div className={`list${refreshing ? ' is-refreshing' : ''}`}>
              {groups.map((g) => (
                <ProductCard key={g.key} group={g} country={country} />
              ))}
            </div>
          )}

          {data && !stale && <StoreRunList runs={data.stores} />}
        </section>
      </div>

      {!wide && (
        <dialog ref={sheetRef} className="sheet" onClose={() => setSheetOpen(false)} aria-label={t((d) => d.filters.title)}>
          <div className="sheet__head">
            <h2 className="sheet__title">{t((d) => d.filters.title)}</h2>
            <button type="button" className="sheet__close" onClick={() => setSheetOpen(false)} aria-label={t((d) => d.filters.close)}>
              <CloseIcon />
            </button>
          </div>
          <div className="sheet__body">{panel}</div>
          <div className="sheet__foot">
            <button type="button" className="btn btn--primary btn--block" onClick={() => setSheetOpen(false)}>
              {t((d) => d.filters.apply, { n: groups.length })}
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
