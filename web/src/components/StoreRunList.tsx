import type { StoreRun, StoreRunStatus } from '../../../shared/contracts.ts';
import { useT } from '../i18n/index.ts';
import { StoreMark } from './StoreMark.tsx';

const ORDER: Record<StoreRunStatus, number> = {
  ok: 0,
  'sin-resultados': 1,
  'tiempo-agotado': 2,
  bloqueada: 3,
  'requiere-credenciales': 4,
  error: 5,
};

/** Qué pasó con cada tienda: para que nunca parezca que "no hay" cuando en realidad una tienda falló. */
export function StoreRunList({ runs }: { runs: StoreRun[] }) {
  const { t, tn } = useT();
  const ok = runs.filter((r) => r.status === 'ok').length;
  const empty = runs.filter((r) => r.status === 'sin-resultados').length;
  const failed = runs.length - ok - empty;
  const sorted = [...runs].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.count - a.count || a.storeName.localeCompare(b.storeName));

  return (
    <details className="runs">
      <summary className="runs__summary">
        <span className="runs__title">{t((d) => d.storeRun.title)}</span>
        <span className="runs__sub">{t((d) => d.storeRun.summary, { ok, empty, failed })}</span>
      </summary>
      <ul className="runs__list">
        {sorted.map((r) => (
          <li key={r.storeId} className={`runs__row${r.status === 'ok' ? '' : ' runs__row--off'}`}>
            <StoreMark id={r.storeId} name={r.storeName} size="sm" />
            <span className="runs__name">{r.storeName}</span>
            <span className="runs__status">
              {t((d) => d.storeRun.status[r.status])}
              {r.status === 'ok' && <span className="runs__count"> · {tn((d) => d.storeRun.count, r.count)}</span>}
              {r.ageMinutes ? (
                <span className="runs__count">
                  {' · '}
                  {r.ageMinutes >= 90 ? t((d) => d.storeRun.ageHours, { h: Math.round(r.ageMinutes / 60) }) : t((d) => d.storeRun.ageMinutes, { min: r.ageMinutes })}
                </span>
              ) : null}
            </span>
            <span className="runs__ms">{(r.ms / 1000).toFixed(1)} s</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
