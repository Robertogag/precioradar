import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { CheckIcon } from '../components/icons.tsx';
import { LANGS, useT } from '../i18n/index.ts';
import { api } from '../lib/api.ts';
import { useSettings } from '../state/settings.ts';

const VERSION = '0.2.0';

export function SettingsPage() {
  const { t, lang } = useT();
  const settings = useSettings();
  const countries = useQuery({ queryKey: ['countries'], queryFn: ({ signal }) => api.countries(signal), staleTime: 60 * 60_000 });
  const mine = countries.data?.find((c) => c.code === settings.country);

  useEffect(() => {
    document.title = `${t((d) => d.settings.title)} · ${t((d) => d.app.title)}`;
  }, [t]);

  return (
    <div className="wrap section section--narrow">
      <header className="section__head">
        <h1 className="section__title">{t((d) => d.settings.title)}</h1>
      </header>

      <div className="form">
        <fieldset className="field">
          <legend className="field__label">{t((d) => d.settings.language)}</legend>
          <div className="radios">
            {LANGS.map((l) => (
              <label key={l} className={`radio${l === lang ? ' is-on' : ''}`}>
                <input type="radio" name="lang" value={l} checked={l === lang} onChange={() => settings.setLang(l)} />
                <span className="radio__text">{t((d) => d.settings[l])}</span>
                {l === lang && <CheckIcon className="radio__check" width={18} height={18} />}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label className="field__label" htmlFor="country">
            {t((d) => d.settings.country)}
          </label>
          <select id="country" className="select" value={settings.country} onChange={(e) => settings.setCountry(e.target.value)} disabled={!countries.data}>
            {(countries.data ?? [{ code: settings.country, name: settings.country, activeStores: 0, currency: '', locale: '', states: [] }]).map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} · {c.activeStores}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="field__label" htmlFor="state">
            {t((d) => d.settings.state)}
          </label>
          <select id="state" className="select" value={settings.state ?? ''} onChange={(e) => settings.setState(e.target.value || null)} disabled={!mine}>
            <option value="">{t((d) => d.settings.anyState)}</option>
            {(mine?.states ?? []).map((s) => (
              <option key={s.code} value={s.code}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="field__hint">{t((d) => d.settings.stateHint)}</p>
        </div>

        <div className="field">
          <span className="field__label">{t((d) => d.settings.recent)}</span>
          <p className="field__hint">{t((d) => d.settings.recentHint)}</p>
          <button type="button" className="btn btn--ghost" onClick={settings.clearRecent} disabled={settings.recent.length === 0}>
            {t((d) => d.settings.clearRecent)} · {settings.recent.length}
          </button>
        </div>

        <div className="field about">
          <span className="field__label">{t((d) => d.settings.about)}</span>
          <p className="about__text">{t((d) => d.settings.aboutText)}</p>
          <p className="about__version">{t((d) => d.settings.version, { v: VERSION })}</p>
        </div>
      </div>
    </div>
  );
}
