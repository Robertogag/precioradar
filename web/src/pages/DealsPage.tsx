import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { StoreMark } from '../components/StoreMark.tsx';
import { CardSkeletons, EmptyState, ErrorState } from '../components/States.tsx';
import { StoreRunList } from '../components/StoreRunList.tsx';
import { ExternalIcon } from '../components/icons.tsx';
import { useT } from '../i18n/index.ts';
import { api } from '../lib/api.ts';
import { ago, money } from '../lib/format.ts';
import { isSafeHttpUrl, isSafeImageUrl } from '../lib/url.ts';
import { useSettings } from '../state/settings.ts';

export function DealsPage() {
  const { t, tn, locale } = useT();
  const country = useSettings((s) => s.country);
  const [onlyStore, setOnlyStore] = useState<string | null>(null);
  const deals = useQuery({ queryKey: ['deals', country], queryFn: ({ signal }) => api.deals(country, signal), staleTime: 5 * 60_000, retry: false });

  useEffect(() => {
    document.title = `${t((d) => d.deals.title)} · ${t((d) => d.app.title)}`;
  }, [t]);

  const stores = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const o of deals.data?.offers ?? []) {
      const cur = map.get(o.storeId);
      if (cur) cur.count += 1;
      else map.set(o.storeId, { id: o.storeId, name: o.storeName, count: 1 });
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [deals.data]);

  const offers = (deals.data?.offers ?? []).filter((o) => !onlyStore || o.storeId === onlyStore);

  return (
    <div className="wrap section">
      <header className="section__head">
        <h1 className="section__title">{t((d) => d.deals.title)}</h1>
        <p className="section__lead">{t((d) => d.deals.lead)}</p>
        {deals.data && <p className="section__meta">{t((d) => d.deals.updated, { ago: ago(deals.data.generatedAt, locale) })}</p>}
      </header>

      {stores.length > 1 && (
        <div className="chips chips--scroll deals__stores">
          <button type="button" className={`chip chip--sm${onlyStore === null ? ' is-on' : ''}`} aria-pressed={onlyStore === null} onClick={() => setOnlyStore(null)}>
            {t((d) => d.filters.all)}
          </button>
          {stores.map((s) => (
            <button key={s.id} type="button" className={`chip chip--sm${onlyStore === s.id ? ' is-on' : ''}`} aria-pressed={onlyStore === s.id} onClick={() => setOnlyStore(s.id)}>
              <StoreMark id={s.id} name={s.name} size="sm" />
              {s.name} · {s.count}
            </button>
          ))}
        </div>
      )}

      {deals.isError ? (
        <ErrorState error={deals.error} onRetry={() => void deals.refetch()} />
      ) : deals.isPending ? (
        <CardSkeletons count={3} />
      ) : offers.length === 0 ? (
        <EmptyState title={t((d) => d.deals.none)} />
      ) : (
        <>
          <p className="section__count">{tn((d) => d.deals.count, offers.length)}</p>
          <ul className="deals">
            {offers.map((o) => {
              const safe = isSafeHttpUrl(o.url);
              const image = isSafeImageUrl(o.imageUrl) ? o.imageUrl : null;
              const body = (
                <>
                  <div className="deal__media">
                    {image ? <img className="deal__img" src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" /> : <div className="card__noimg" />}
                    <span className="deal__off">−{o.discountPct} %</span>
                  </div>
                  <div className="deal__body">
                    <p className="deal__title">{o.title}</p>
                    <p className="deal__price">
                      {money(o.price, o.currency, locale)}
                      {o.listPrice !== null && <s className="deal__before">{money(o.listPrice, o.currency, locale)}</s>}
                    </p>
                    <p className="deal__store">
                      <StoreMark id={o.storeId} name={o.storeName} size="sm" />
                      {o.storeName}
                      {safe && <ExternalIcon className="deal__ext" width={14} height={14} />}
                    </p>
                  </div>
                </>
              );
              return (
                <li key={o.id} className="deal">
                  {safe ? (
                    <a className="deal__link" href={o.url} target="_blank" rel="noopener noreferrer nofollow" title={t((d) => d.common.externalLink)}>
                      {body}
                    </a>
                  ) : (
                    <div className="deal__link">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <StoreRunList runs={deals.data.stores} />
        </>
      )}
    </div>
  );
}
