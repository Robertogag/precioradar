import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Offer, ProductGroup, Recommendation } from '../../../shared/contracts.ts';
import { useT } from '../i18n/index.ts';
import { api } from '../lib/api.ts';
import { ago, money, savingsPct } from '../lib/format.ts';
import { useNearViewport } from '../lib/near-viewport.ts';
import { isSafeHttpUrl, isSafeImageUrl } from '../lib/url.ts';
import { PriceHistory } from './PriceHistory.tsx';
import { CheckIcon, ExternalIcon, HistoryIcon } from './icons.tsx';
import { StoreMark } from './StoreMark.tsx';

const COLLAPSED = 6;

function OfferRow({ offer, min, best, comparing, recommended, rec }: { offer: Offer; min: number; best: boolean; comparing: boolean; recommended: boolean; rec: Recommendation | null }) {
  const { t, locale } = useT();
  const above = offer.price - min;
  const safe = isSafeHttpUrl(offer.url);
  return (
    <li className={`offer${best ? ' offer--best' : ''}`}>
      <StoreMark id={offer.storeId} name={offer.storeName} size="sm" />
      <span className="offer__store">
        <span className="offer__name">
          {offer.storeName}
          {offer.seller && offer.seller.toLowerCase() !== offer.storeName.toLowerCase() && (
            <span className="offer__seller"> · {t((d) => d.product.seller, { seller: offer.seller })}</span>
          )}
        </span>
        {offer.extras.length > 0 && <span className="offer__inc">{t((d) => d.product.includes, { extras: offer.extras.join(' + ') })}</span>}
        {offer.seenAt && (
          <span className="offer__stale">
            {offer.seenBy === 'usuario'
              ? t((d) => d.product.seenByUser, { ago: ago(offer.seenAt, locale) })
              : t((d) => d.product.staleSince, { ago: ago(offer.seenAt, locale) })}
          </span>
        )}
        {(best && comparing) || recommended ? (
          <span className="offer__tags">
            {best && comparing && <span className="offer__tag">{t((d) => d.product.bestPrice)}</span>}
            {recommended && !(best && rec?.kind === 'mas-barato') && <span className="offer__tag offer__tag--pick">{t((d) => d.product.recommended)}</span>}
          </span>
        ) : null}
      </span>
      {/* Cuánto más que el mejor precio, en pesos: se entiende sin leyenda. */}
      <span className="offer__diff" title={comparing && above >= 1 ? t((d) => d.product.aboveBest, { amount: money(above, offer.currency, locale) }) : undefined}>
        {comparing && above >= 1 ? `+${money(above, offer.currency, locale)}` : ''}
      </span>
      <span className="offer__price">{money(offer.price, offer.currency, locale)}</span>
      <span className="offer__extra">
        {offer.discountPct !== null && offer.listPrice !== null && (
          <>
            <s className="offer__before">{money(offer.listPrice, offer.currency, locale)}</s>
            <span className="offer__off">−{offer.discountPct} %</span>
          </>
        )}
      </span>
      {safe ? (
        <a className="offer__go" href={offer.url} target="_blank" rel="noopener noreferrer nofollow" title={t((d) => d.common.externalLink)}>
          {t((d) => d.product.go)}
          <ExternalIcon width={16} height={16} />
        </a>
      ) : (
        <span className="offer__go offer__go--off" />
      )}
    </li>
  );
}

/** Qué conviene más, dicho con números: el más barato, o el paquete que por poco más incluye algo. */
function Recommendation({ group }: { group: ProductGroup }) {
  const { t, locale } = useT();
  const rec = group.recommendation;
  if (!rec) return null;
  const offer = group.offers.find((o) => o.id === rec.offerId);
  if (!offer) return null;
  const extras = rec.extras.join(' + ');
  const text =
    rec.kind === 'mejor-valor'
      ? t((d) => d.product.recommendValueShort, { amount: money(rec.extraCost, offer.currency, locale), store: offer.storeName, extras })
      : rec.extras.length > 0
        ? t((d) => d.product.recommendBestExtrasShort, { store: offer.storeName, extras })
        : t((d) => d.product.recommendBestShort, { store: offer.storeName });
  return (
    <p className="pick">
      <CheckIcon className="pick__icon" width={16} height={16} />
      <span>{text}</span>
    </p>
  );
}

/** El mismo producto visto en varias tiendas: dónde está más barato, qué conviene, el precio de cada una y su historial. */
export function ProductCard({ group, country }: { group: ProductGroup; country: string }) {
  const { t, locale } = useT();
  const [expanded, setExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const shown = expanded ? group.offers : group.offers.slice(0, COLLAPSED);
  const pct = savingsPct(group.minPrice, group.maxPrice);
  const image = isSafeImageUrl(group.imageUrl) ? group.imageUrl : null;
  const comparing = group.storeCount > 1;
  // El buscador de la tienda viene con la búsqueda; la página exacta del producto se pide aparte (solo cuando la
  // tarjeta se acerca a la pantalla) y, si llega, lo sustituye.
  const [cardRef, near] = useNearViewport<HTMLElement>();
  const resolved = useQuery({
    queryKey: ['links', country, group.title, group.brand],
    queryFn: ({ signal }) => api.links(group.title, group.brand, country, signal),
    enabled: near && group.links.length > 0,
    staleTime: 60 * 60_000,
    retry: false,
  });
  const links = (resolved.data?.links ?? group.links).filter((l) => isSafeHttpUrl(l.url));

  return (
    <article className="card" ref={cardRef}>
      <div className="card__media">
        {image ? (
          <img className="card__img" src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        ) : (
          <div className="card__noimg" aria-label={t((d) => d.product.noImage)} />
        )}
      </div>
      <div className="card__body">
        <div className="card__head">
          {group.brand && <span className="card__brand">{group.brand}</span>}
          {group.condition === 'reacondicionado' && <span className="card__cond">{t((d) => d.product.refurbished)}</span>}
          {group.best.isAccessory && <span className="card__cond">{t((d) => d.product.accessory)}</span>}
        </div>
        <h3 className="card__title">{group.title}</h3>

        <div className="best">
          <span className="best__label">{t((d) => d.product.cheapestAt)}</span>
          <StoreMark id={group.best.storeId} name={group.best.storeName} size="sm" />
          <span className="best__store">{group.best.storeName}</span>
          <span className="best__price">{money(group.minPrice, group.best.currency, locale)}</span>
        </div>
        {group.spread > 0 ? (
          <p className="card__save">{t((d) => d.product.savings, { amount: money(group.spread, group.best.currency, locale), pct })}</p>
        ) : (
          group.storeCount === 1 && <p className="card__one">{t((d) => d.product.onlyOneStore)}</p>
        )}
        <Recommendation group={group} />

        <ul className="offers">
          {shown.map((o) => (
            <OfferRow
              key={o.id}
              offer={o}
              min={group.minPrice}
              best={o.id === group.best.id}
              comparing={comparing}
              recommended={group.recommendation?.offerId === o.id}
              rec={group.recommendation}
            />
          ))}
        </ul>
        <div className="card__actions">
          {group.offers.length > COLLAPSED && (
            <button type="button" className="card__more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
              {expanded ? t((d) => d.product.seeLess) : t((d) => d.product.seeAll, { n: group.offers.length })}
            </button>
          )}
          <button type="button" className="card__hist" onClick={() => setHistoryOpen((v) => !v)} aria-expanded={historyOpen}>
            <HistoryIcon width={16} height={16} />
            {historyOpen ? t((d) => d.product.hideHistory) : t((d) => d.product.showHistory)}
          </button>
          {links.map((l) => (
            <a
              key={l.storeId}
              className="card__link"
              href={l.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title={t((d) => d.product.linkHint, { store: l.storeName })}
            >
              <StoreMark id={l.storeId} name={l.storeName} size="sm" />
              {l.kind === 'producto' ? t((d) => d.product.openIn, { store: l.storeName }) : t((d) => d.product.searchIn, { store: l.storeName })}
              <ExternalIcon width={14} height={14} />
            </a>
          ))}
        </div>
        {historyOpen && <PriceHistory group={group} />}
      </div>
    </article>
  );
}
