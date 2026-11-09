import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { StoreInfo } from '../../../shared/contracts.ts';
import { StoreMark } from '../components/StoreMark.tsx';
import { CardSkeletons, ErrorState } from '../components/States.tsx';
import { ExternalIcon } from '../components/icons.tsx';
import { useT } from '../i18n/index.ts';
import { api } from '../lib/api.ts';
import { hostOf, isSafeHttpUrl } from '../lib/url.ts';
import { useSettings } from '../state/settings.ts';

function StoreCard({ store }: { store: StoreInfo }) {
  const { t } = useT();
  const safe = isSafeHttpUrl(store.homepage);
  return (
    <li className={`store${store.availability === 'activa' ? '' : ' store--off'}`}>
      <div className="store__head">
        <StoreMark id={store.id} name={store.name} size="lg" />
        <div className="store__id">
          <h3 className="store__name">{store.name}</h3>
          <p className="store__meta">
            {t((d) => d.stores.access[store.access])} · {t((d) => d.stores.availability[store.availability])}
          </p>
        </div>
        {safe && (
          <a className="store__link" href={store.homepage} target="_blank" rel="noopener noreferrer nofollow">
            {hostOf(store.homepage)}
            <ExternalIcon width={14} height={14} />
          </a>
        )}
      </div>
      {store.note && <p className="store__note">{store.note}</p>}
    </li>
  );
}

export function StoresPage() {
  const { t } = useT();
  const country = useSettings((s) => s.country);
  const stores = useQuery({ queryKey: ['stores', country], queryFn: ({ signal }) => api.stores(country, signal), staleTime: 60 * 60_000 });

  useEffect(() => {
    document.title = `${t((d) => d.stores.title)} · ${t((d) => d.app.title)}`;
  }, [t]);

  const active = (stores.data ?? []).filter((s) => s.availability === 'activa');
  const pending = (stores.data ?? []).filter((s) => s.availability !== 'activa');

  return (
    <div className="wrap section">
      <header className="section__head">
        <h1 className="section__title">{t((d) => d.stores.title)}</h1>
        <p className="section__lead">{t((d) => d.stores.lead)}</p>
      </header>

      {stores.isError ? (
        <ErrorState error={stores.error} onRetry={() => void stores.refetch()} />
      ) : stores.isPending ? (
        <CardSkeletons count={3} />
      ) : (
        <>
          <h2 className="section__sub">
            {t((d) => d.stores.active)} · {active.length}
          </h2>
          <ul className="stores">
            {active.map((s) => (
              <StoreCard key={s.id} store={s} />
            ))}
          </ul>
          <h2 className="section__sub">
            {t((d) => d.stores.pending)} · {pending.length}
          </h2>
          <ul className="stores">
            {pending.map((s) => (
              <StoreCard key={s.id} store={s} />
            ))}
          </ul>
          <p className="section__rule">{t((d) => d.stores.rule)}</p>
        </>
      )}
    </div>
  );
}
