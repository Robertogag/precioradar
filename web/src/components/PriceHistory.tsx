import { useQuery } from '@tanstack/react-query';
import { type CSSProperties, type MouseEvent, useId, useMemo, useState } from 'react';
import type { PricePoint, ProductGroup } from '../../../shared/contracts.ts';
import { type HistorySeries, type SeriesSelection, defaultSelection, eligibleSeries, orderSeries, toggleSeries } from '../../../shared/history-series.ts';
import { useT } from '../i18n/index.ts';
import { api } from '../lib/api.ts';
import { labelIndexes, monotonePath, niceTicks } from '../lib/chart.ts';
import { money } from '../lib/format.ts';
import { useSettings } from '../state/settings.ts';
import { HistoryIcon } from './icons.tsx';
import { StoreMark } from './StoreMark.tsx';

type Preset = 'd7' | 'd30' | 'd90' | 'y1' | 'all' | 'custom';
const PRESET_DAYS: Record<'d7' | 'd30' | 'd90' | 'y1', number> = { d7: 7, d30: 30, d90: 90, y1: 365 };
const PRESETS: Preset[] = ['d7', 'd30', 'd90', 'y1', 'all', 'custom'];
/** Con pocas series el área bajo la curva ayuda a leer; con muchas, se encima y estorba. */
const AREAS_UP_TO = 2;

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' });
const todayMx = () => dayFmt.format(new Date());
function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
function fmtDay(day: string, locale: string, long = false): string {
  const date = new Date(`${day}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale, long ? { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' } : { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date);
}

/** Diferencia entre el último precio y el anterior de la misma tienda; null si solo hay un dato. */
const change = (points: PricePoint[]): number | null => (points.length >= 2 ? points[points.length - 1]!.price - points[points.length - 2]!.price : null);

/** ▼ bajó (verde), ▲ subió (rojo), = igual (gris). `compact` = solo el símbolo, para las celdas de la tabla. */
function Delta({ value, currency, compact = false }: { value: number | null; currency: string; compact?: boolean }) {
  const { t, locale } = useT();
  if (value === null) return null;
  const dir = value < 0 ? 'down' : value > 0 ? 'up' : 'flat';
  const symbol = dir === 'down' ? '▼' : dir === 'up' ? '▲' : '=';
  const text = dir === 'flat' ? t((d) => d.history.flat) : t((d) => d.history[dir], { amount: money(Math.abs(value), currency, locale) });
  return (
    <span className={`delta delta--${dir}${compact ? ' delta--compact' : ''}`} title={`${text} ${t((d) => d.history.vsPrevious)}`} aria-label={text}>
      {symbol}
      {!compact && <span className="delta__text">{text}</span>}
    </span>
  );
}

const W = 720;
const H = 260;
const PAD = { top: 18, right: 18, bottom: 30, left: 58 };

/**
 * Historial de precios del grupo: una curva por tienda sobre los días que tienen datos (no sobre el calendario,
 * para que los huecos no aplasten la gráfica), mínimo y máximo a la vista, tooltip por día, tabla y periodo a elegir.
 */
export function PriceHistory({ group }: { group: ProductGroup }) {
  const { t, tn, locale } = useT();
  const country = useSettings((s) => s.country);
  const uid = useId().replace(/:/g, '');
  const today = todayMx();
  const [preset, setPreset] = useState<Preset>('d90');
  const [custom, setCustom] = useState({ from: addDays(today, -29), to: today });
  const [includeBundles, setIncludeBundles] = useState(false);
  /** Lo que el usuario mostró u ocultó, válido solo para este conjunto de series (`sig`); si cambian, vuelve lo de entrada. */
  const [override, setOverride] = useState<{ sig: string; sel: SeriesSelection } | null>(null);
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const [hover, setHover] = useState<number | null>(null);

  const coverage = useQuery({ queryKey: ['coverage', country], queryFn: ({ signal }) => api.coverage(country, signal), staleTime: 5 * 60_000, retry: false });
  const since = coverage.data?.since ?? null;
  const range =
    preset === 'all'
      ? { from: since ?? today, to: today }
      : preset === 'custom'
        ? custom
        : { from: addDays(today, -(PRESET_DAYS[preset] - 1)), to: today };

  const ids = useMemo(() => group.offers.map((o) => o.id), [group]);
  const history = useQuery({
    queryKey: ['history', country, ids.join(','), range.from, range.to],
    queryFn: ({ signal }) => api.history(ids, country, range.from, range.to, signal),
    staleTime: 5 * 60_000,
    retry: false,
  });

  // Series por precio (la más barata primero); de entrada solo el producto solo en las 6 tiendas más baratas.
  const series = useMemo(() => orderSeries(history.data?.items ?? [], group.offers), [history.data, group]);
  const eligible = useMemo(() => eligibleSeries(series, includeBundles), [series, includeBundles]);
  const bundles = series.filter((s) => s.bundle).length;
  const sig = `${includeBundles}|${series.map((s) => s.key).join(',')}`;
  const sel = override?.sig === sig ? override.sel : defaultSelection(series, includeBundles);
  const toggle = (key: string) => setOverride({ sig, sel: toggleSeries(sel, eligible, key) });
  const visible = eligible.filter((s) => sel.shown.includes(s.key));
  const slot = (s: HistorySeries) => sel.slots[s.key] ?? 1;
  /** El color viene de --series-N y cambia con el tema. */
  const color = (s: HistorySeries) => `var(--series-${slot(s)})`;
  const label = (s: HistorySeries) => (s.bundle ? `${s.storeName} · ${t((d) => d.product.bundle)}` : s.storeName);

  // Eje X categórico: solo los días con algún dato, repartidos parejo.
  const days = useMemo(() => [...new Set(visible.flatMap((s) => s.item.points.map((p) => p.date)))].sort(), [visible]);
  const dayAt = useMemo(() => new Map(days.map((d, i) => [d, i])), [days]);
  const n = days.length;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const sx = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const allPoints = visible.flatMap((s) => s.item.points.map((p) => ({ s, p })));
  const prices = allPoints.map((x) => x.p.price);
  const pMin = prices.length ? Math.min(...prices) : 0;
  const pMax = prices.length ? Math.max(...prices) : 1;
  const padY = Math.max((pMax - pMin) * 0.12, pMax * 0.03);
  const y0 = Math.max(0, pMin - padY);
  const y1 = pMax + padY;
  const sy = (price: number) => PAD.top + (1 - (price - y0) / (y1 - y0)) * innerH;
  const yTicks = niceTicks(y0, y1, 3).filter((v) => v > y0 && v < y1);
  const labels = labelIndexes(n, 9);
  const lowest = allPoints.sort((a, b) => a.p.price - b.p.price)[0];
  const highest = allPoints.length ? allPoints[allPoints.length - 1] : undefined;
  const latest = visible.map((s) => ({ s, p: s.item.points[s.item.points.length - 1]! })).sort((a, b) => a.p.price - b.p.price)[0];
  const currency = group.best.currency;

  function onMove(e: MouseEvent<SVGRectElement>) {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = PAD.left + ((e.clientX - rect.left) / rect.width) * innerW;
    let best = 0;
    let dist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(sx(i) - px);
      if (d < dist) {
        dist = d;
        best = i;
      }
    }
    setHover(best);
  }

  const sinceText = since && since !== today ? t((d) => d.history.since, { date: fmtDay(since, locale, true) }) : t((d) => d.history.sinceToday);

  return (
    <section className="history" aria-label={t((d) => d.history.title)}>
      <div className="history__bar">
        <span className="history__label">{t((d) => d.history.period)}</span>
        <div className="seg" role="group" aria-label={t((d) => d.history.period)}>
          {PRESETS.map((p) => (
            <button key={p} type="button" className={`seg__btn${preset === p ? ' is-on' : ''}`} aria-pressed={preset === p} onClick={() => setPreset(p)}>
              {t((d) => d.history[p])}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="history__dates">
            <label>
              <span className="sr-only">{t((d) => d.history.from)}</span>
              <input type="date" className="history__date" value={custom.from} min={since ?? undefined} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value || custom.from })} />
            </label>
            <span aria-hidden="true">–</span>
            <label>
              <span className="sr-only">{t((d) => d.history.to)}</span>
              <input type="date" className="history__date" value={custom.to} min={custom.from} max={today} onChange={(e) => setCustom({ ...custom, to: e.target.value || custom.to })} />
            </label>
          </div>
        )}
        <div className="seg seg--right" role="group">
          <button type="button" className={`seg__btn${view === 'chart' ? ' is-on' : ''}`} aria-pressed={view === 'chart'} onClick={() => setView('chart')}>
            {t((d) => d.history.chart)}
          </button>
          <button type="button" className={`seg__btn${view === 'table' ? ' is-on' : ''}`} aria-pressed={view === 'table'} onClick={() => setView('table')}>
            {t((d) => d.history.table)}
          </button>
        </div>
      </div>

      {history.isPending ? (
        <p className="history__empty">{t((d) => d.history.loading)}</p>
      ) : history.isError ? (
        <p className="history__empty">{t((d) => d.history.error)}</p>
      ) : series.length === 0 ? (
        <p className="history__empty">
          {t((d) => d.history.none)} {sinceText}
        </p>
      ) : (
        <div className="chart">
          <div className="chart__head">
            <span className="chart__title">
              <HistoryIcon width={18} height={18} />
              {t((d) => d.history.title)}
            </span>
            {lowest && highest && (
              <span className="chart__stats">
                <span>
                  {t((d) => d.history.min)} <b className="chart__min">{money(lowest.p.price, currency, locale)}</b>
                </span>
                <span>
                  {t((d) => d.history.max)} <b className="chart__max">{money(highest.p.price, currency, locale)}</b>
                </span>
              </span>
            )}
          </div>

          {/* Una ficha por tienda: logotipo, nombre, último precio y si bajó o subió. La línea de color abajo dice cuál curva es; apagada, no está en la gráfica. */}
          <ul className="history__legend" aria-label={t((d) => d.history.legendHint)}>
            {eligible.map((s) => {
              const on = sel.shown.includes(s.key);
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    className={`tile${on ? ' is-on' : ''}`}
                    style={on ? ({ '--tile-color': color(s) } as CSSProperties) : undefined}
                    aria-pressed={on}
                    title={on ? t((d) => d.history.hideStore, { store: label(s) }) : t((d) => d.history.showStore, { store: label(s) })}
                    onClick={() => toggle(s.key)}>
                    <StoreMark id={s.item.storeId} name={s.storeName} size="md" />
                    <span className="tile__text">
                      <span className="tile__name">
                        {s.storeName}
                        {s.bundle && <span className="tile__bundle"> · {t((d) => d.product.bundle)}</span>}
                      </span>
                      <span className="tile__price">
                        {money(s.item.last, currency, locale)}
                        <Delta value={change(s.item.points)} currency={currency} />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {bundles > 0 && (
            <button type="button" className="history__link" aria-pressed={includeBundles} onClick={() => setIncludeBundles((v) => !v)}>
              {includeBundles ? t((d) => d.history.bundlesHide) : t((d) => d.history.bundlesShow, { n: bundles })}
            </button>
          )}

          {view === 'chart' ? (
            <div className="chart__plot" onMouseLeave={() => setHover(null)}>
              <svg className="chart__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t((d) => d.history.title)}>
                <defs>
                  {visible.map((s) => (
                    <linearGradient key={s.key} id={`g${uid}${slot(s)}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopOpacity="0.28" style={{ stopColor: color(s) }} />
                      <stop offset="100%" stopOpacity="0" style={{ stopColor: color(s) }} />
                    </linearGradient>
                  ))}
                </defs>
                {yTicks.map((v) => (
                  <g key={v}>
                    <line className="chart__grid" x1={PAD.left} x2={W - PAD.right} y1={sy(v)} y2={sy(v)} />
                    <text className="chart__axis" x={PAD.left - 8} y={sy(v) + 4} textAnchor="end">
                      {money(v, currency, locale)}
                    </text>
                  </g>
                ))}
                {labels.map((i) => (
                  <text key={days[i]} className="chart__axis" x={sx(i)} y={H - 8} textAnchor="middle">
                    {fmtDay(days[i]!, locale)}
                  </text>
                ))}
                {hover !== null && <line className="chart__cross" x1={sx(hover)} x2={sx(hover)} y1={PAD.top} y2={H - PAD.bottom} />}
                {visible.map((s) => {
                  const pts = s.item.points.map((p) => ({ x: sx(dayAt.get(p.date) ?? 0), y: sy(p.price) }));
                  const path = monotonePath(pts);
                  const base = H - PAD.bottom;
                  return (
                    <g key={s.key}>
                      {pts.length > 1 && visible.length <= AREAS_UP_TO && (
                        <path d={`${path} L${pts[pts.length - 1]!.x},${base} L${pts[0]!.x},${base} Z`} fill={`url(#g${uid}${slot(s)})`} />
                      )}
                      {pts.length > 1 && <path className="chart__line" d={path} style={{ stroke: color(s) }} />}
                      {s.item.points.map((p, i) => {
                        const idx = dayAt.get(p.date) ?? 0;
                        return <circle key={p.date} className="chart__dot" cx={pts[i]!.x} cy={pts[i]!.y} r={hover === idx ? 6 : 4} style={{ fill: color(s) }} />;
                      })}
                    </g>
                  );
                })}
                <rect x={PAD.left} y={PAD.top} width={innerW} height={innerH} fill="transparent" onMouseMove={onMove} />
              </svg>
              {hover !== null && (
                <div
                  className={`chart__tip${sx(hover) > W * 0.62 ? ' chart__tip--left' : sx(hover) < W * 0.3 ? ' chart__tip--right' : ''}`}
                  style={{ left: `${(sx(hover) / W) * 100}%` }}>
                  <div className="chart__tipdate">{fmtDay(days[hover]!, locale, true)}</div>
                  {visible.map((s) => {
                    const p = s.item.points.find((x) => x.date === days[hover]);
                    return p ? (
                      <div key={s.key} className="chart__tiprow">
                        <span className="leg__swatch" style={{ background: color(s) }} />
                        <span className="chart__tipname">{label(s)}</span>
                        <b>{money(p.price, currency, locale)}</b>
                      </div>
                    ) : null;
                  })}
                </div>
              )}
              {hover === null && n > 1 && <p className="chart__hint">{t((d) => d.history.hoverHint)}</p>}
            </div>
          ) : (
            <div className="history__tablewrap">
              <table className="history__table">
                <thead>
                  <tr>
                    <th scope="col">{t((d) => d.history.date)}</th>
                    {visible.map((s) => (
                      <th key={s.key} scope="col">
                        {label(s)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...days].reverse().map((d) => (
                    <tr key={d}>
                      <td>{fmtDay(d, locale, true)}</td>
                      {visible.map((s) => {
                        const p = s.item.points.find((x) => x.date === d);
                        // Frente al día anterior con dato de esa tienda.
                        const k = dayAt.get(d) ?? 0;
                        const prevDay = days[k - 1];
                        const prev = prevDay ? s.item.points.find((x) => x.date === prevDay) : undefined;
                        return (
                          <td key={s.key} className={p && lowest && p.price === lowest.p.price ? 'is-min' : undefined}>
                            {p ? money(p.price, currency, locale) : '—'}
                            {p && prev && <Delta value={p.price - prev.price} currency={currency} compact />}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="history__deltahint">{t((d) => d.history.deltaHint)}</p>
            </div>
          )}

          <div className="history__summary">
            {latest && <span>{t((d) => d.history.today, { price: money(latest.p.price, currency, locale), store: label(latest.s), date: fmtDay(latest.p.date, locale, true) })}</span>}
            {lowest && <span>{t((d) => d.history.lowest, { price: money(lowest.p.price, currency, locale), date: fmtDay(lowest.p.date, locale, true), store: label(lowest.s) })}</span>}
            <span>
              {tn((d) => d.history.days, n)} · {sinceText}
            </span>
          </div>
        </div>
      )}
    </section>
  );
}
