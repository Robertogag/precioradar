import type { ReactNode } from 'react';
import { useT } from '../i18n/index.ts';
import { ApiFailure } from '../lib/api.ts';

export function CardSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="list" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card sk">
          <div className="card__media sk__block" />
          <div className="card__body">
            <div className="sk__line" style={{ width: '30%' }} />
            <div className="sk__line sk__line--lg" style={{ width: '85%' }} />
            <div className="sk__line" style={{ width: '55%' }} />
            <div className="sk__line" style={{ width: '95%' }} />
            <div className="sk__line" style={{ width: '90%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="state" role="status">
      <p className="state__title">{title}</p>
      {text && <p className="state__text">{text}</p>}
      {action && <div className="state__action">{action}</div>}
    </div>
  );
}

/** Mensaje para la persona según lo que pasó: sin servidor, demasiadas búsquedas, o lo que dijo el servidor. */
export function errorText(err: unknown, t: ReturnType<typeof useT>['t']): string {
  if (err instanceof ApiFailure) {
    if (err.unreachable) return t((d) => d.common.unreachable);
    if (err.status === 429) return t((d) => d.common.tooMany);
    return err.message;
  }
  return t((d) => d.results.error);
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useT();
  return (
    <div className="state state--error" role="alert">
      <p className="state__title">{t((d) => d.results.error)}</p>
      <p className="state__text">{errorText(error, t)}</p>
      {onRetry && (
        <div className="state__action">
          <button type="button" className="btn btn--primary" onClick={onRetry}>
            {t((d) => d.results.retry)}
          </button>
        </div>
      )}
    </div>
  );
}
