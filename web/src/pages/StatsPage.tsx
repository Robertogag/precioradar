import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useEffect, useState } from 'react';
import type { StatsResponse } from '../../../shared/contracts.ts';
import { StoreMark } from '../components/StoreMark.tsx';
import { ApiFailure, api } from '../lib/api.ts';
import { useSettings } from '../state/settings.ts';

/**
 * Reporte privado de uso (solo para el dueño, sin enlace en el menú y sin traducir). Pide la llave del reporte y la
 * recuerda solo en esta pestaña; sin la llave correcta el servidor contesta como si la ruta no existiera.
 */
const KEY_STORAGE = 'precioradar:stats-key';
const PERIODS = [7, 14, 30, 90] as const;

const readKey = (): string => {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
};
const writeKey = (key: string | null) => {
  try {
    if (key) sessionStorage.setItem(KEY_STORAGE, key);
    else sessionStorage.removeItem(KEY_STORAGE);
  } catch {
    // sin almacenamiento (ventana privada): la llave vive solo mientras la página siga abierta
  }
};

const n = (v: number) => v.toLocaleString('es-MX');
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)} %` : '—');
const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const when = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });

export function StatsPage() {
  const country = useSettings((s) => s.country);
  const [key, setKey] = useState(readKey);
  const [draft, setDraft] = useState('');
  const [days, setDays] = useState<number>(14);

  useEffect(() => {
    document.title = 'Uso · PrecioRadar';
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  const report = useQuery({
    queryKey: ['stats', key, country, days],
    queryFn: ({ signal }) => api.stats(key, country, days, signal),
    enabled: key.length > 0,
    retry: false,
    staleTime: 60_000,
  });
  const wrongKey = report.error instanceof ApiFailure && report.error.status === 404;

  useEffect(() => {
    if (wrongKey) writeKey(null);
  }, [wrongKey]);

  const enter = (e: FormEvent) => {
    e.preventDefault();
    const k = draft.trim();
    if (!k) return;
    writeKey(k);
    setKey(k);
    setDraft('');
  };
  const leave = () => {
    writeKey(null);
    setKey('');
  };

  if (!key || wrongKey) {
    return (
      <div className="wrap stats stats--gate">
        <h1 className="stats__title">Uso de PrecioRadar</h1>
        <form className="stats__gate" onSubmit={enter}>
          <label className="stats__label" htmlFor="stats-key">
            Llave del reporte
          </label>
          <input
            id="stats-key"
            className="stats__input"
            type="password"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="STATS_KEY de api/.env"
          />
          <button type="submit" className="btn btn--primary">
            Entrar
          </button>
          {wrongKey && <p className="stats__error">Esa llave no es la del reporte.</p>}
        </form>
      </div>
    );
  }

  const r: StatsResponse | undefined = report.data;
  return (
    <div className="wrap stats">
      <header className="stats__head">
        <div>
          <h1 className="stats__title">Uso de PrecioRadar</h1>
          {r && (
            <p className="stats__sub">
              Del {shortDay(r.from)} al {shortDay(r.to)} · hora de México · actualizado {when(r.generatedAt)}
            </p>
          )}
        </div>
        <div className="stats__tools">
          <div className="seg" role="group" aria-label="Periodo">
            {PERIODS.map((p) => (
              <button key={p} type="button" className={`seg__btn${days === p ? ' is-on' : ''}`} aria-pressed={days === p} onClick={() => setDays(p)}>
                {p} días
              </button>
            ))}
          </div>
          <button type="button" className="btn btn--ghost" onClick={() => void report.refetch()} disabled={report.isFetching}>
            Actualizar
          </button>
          <button type="button" className="btn btn--ghost" onClick={leave}>
            Salir
          </button>
        </div>
      </header>

      {report.isError && !wrongKey && <p className="stats__error">No se pudo cargar el reporte. Intenta de nuevo.</p>}
      {!r ? (
        <p className="stats__sub">{report.isFetching ? 'Cargando…' : ''}</p>
      ) : (
        <>
          <section className="stats__kpis" aria-label="Resumen del periodo">
            <div className="stats__kpi">
              <span className="stats__kpi-label">Búsquedas de personas</span>
              <span className="stats__kpi-value">{n(r.totals.searches)}</span>
              <span className="stats__kpi-note">{n(r.totals.fromCache)} salieron de caché ({pct(r.totals.fromCache, r.totals.searches)})</span>
            </div>
            <div className="stats__kpi">
              <span className="stats__kpi-label">Visitas</span>
              <span className="stats__kpi-value">{n(r.totals.visits)}</span>
              <span className="stats__kpi-note">personas distintas por día, sumadas</span>
            </div>
            <div className="stats__kpi">
              <span className="stats__kpi-label">Sin resultados</span>
              <span className="stats__kpi-value">{n(r.noResults.reduce((s, q) => s + q.searches, 0))}</span>
              <span className="stats__kpi-note">búsquedas que ninguna tienda tenía</span>
            </div>
            <div className="stats__kpi">
              <span className="stats__kpi-label">Refresco automático</span>
              <span className="stats__kpi-value">{n(r.totals.refresh)}</span>
              <span className="stats__kpi-note">búsquedas del sistema a las 6:00; no son personas</span>
            </div>
          </section>

          <section className="stats__block">
            <h2 className="stats__h">Por día</h2>
            <div className="stats__tablewrap">
              <table className="stats__table">
                <thead>
                  <tr>
                    <th scope="col">Día</th>
                    <th scope="col">Búsquedas</th>
                    <th scope="col">De caché</th>
                    <th scope="col">Personas</th>
                    <th scope="col">Refresco</th>
                  </tr>
                </thead>
                <tbody>
                  {[...r.daily].reverse().map((d) => (
                    <tr key={d.day} className={d.searches === 0 ? 'is-quiet' : ''}>
                      <th scope="row">{shortDay(d.day)}</th>
                      <td>{n(d.searches)}</td>
                      <td>{n(d.fromCache)}</td>
                      <td>{n(d.visitors)}</td>
                      <td>{n(d.refresh)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <div className="stats__two">
            <QueryTable title="Lo más buscado" rows={r.topQueries} empty="Todavía no hay búsquedas de personas en este periodo." />
            <QueryTable title="Lo que nadie encontró" rows={r.noResults} empty="Todas las búsquedas encontraron algo." />
          </div>

          <section className="stats__block">
            <h2 className="stats__h">Tiendas</h2>
            <p className="stats__sub">
              Consultas nuevas (de personas y del refresco). Las que más fallan, primero. Mercado Libre siempre sale con fallas: no deja consultar
              precios a aplicaciones externas, por eso se enlaza.
            </p>
            <div className="stats__tablewrap">
              <table className="stats__table">
                <thead>
                  <tr>
                    <th scope="col">Tienda</th>
                    <th scope="col">Consultas</th>
                    <th scope="col">Con resultados</th>
                    <th scope="col">Sin el producto</th>
                    <th scope="col">Fallas</th>
                    <th scope="col">Tiempo promedio</th>
                  </tr>
                </thead>
                <tbody>
                  {r.stores.map((s) => (
                    <tr key={s.storeId}>
                      <th scope="row">
                        <span className="stats__store">
                          <StoreMark id={s.storeId} name={s.storeName} size="sm" />
                          {s.storeName}
                        </span>
                      </th>
                      <td>{n(s.runs)}</td>
                      <td>{n(s.ok)}</td>
                      <td>{n(s.empty)}</td>
                      <td>
                        {n(s.failed)} <span className="stats__muted">({pct(s.failed, s.runs)})</span>
                      </td>
                      <td>{(s.avgMs / 1000).toFixed(1)} s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <p className="stats__note">
            "Personas" cuenta códigos de visitante: cada búsqueda lleva uno que se calcula con la conexión y el navegador, cambia cada día y no
            permite saber la IP ni seguir a nadie de un día a otro. Por eso las visitas de varios días se suman, no son personas únicas.
          </p>
        </>
      )}
    </div>
  );
}

function QueryTable({ title, rows, empty }: { title: string; rows: StatsResponse['topQueries']; empty: string }) {
  return (
    <section className="stats__block">
      <h2 className="stats__h">{title}</h2>
      {rows.length === 0 ? (
        <p className="stats__sub">{empty}</p>
      ) : (
        <div className="stats__tablewrap">
          <table className="stats__table">
            <thead>
              <tr>
                <th scope="col">Búsqueda</th>
                <th scope="col">Veces</th>
                <th scope="col">Productos</th>
                <th scope="col">Última vez</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => (
                <tr key={q.query}>
                  <th scope="row">{q.query}</th>
                  <td>{n(q.searches)}</td>
                  <td>{n(q.avgResults)}</td>
                  <td>{when(q.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
