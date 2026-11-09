import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Suggestion, SuggestionKind } from '../../../shared/contracts.ts';
import { useT } from '../i18n/index.ts';
import { api } from '../lib/api.ts';
import { useDebounced } from '../lib/hooks.ts';
import { useSettings } from '../state/settings.ts';
import { ClockIcon, CloseIcon, LayersIcon, SearchIcon, SparkIcon, TrendIcon } from './icons.tsx';

interface Props {
  /** Texto con el que arranca (la búsqueda actual en la página de resultados). */
  initial?: string;
  variant?: 'hero' | 'bar';
  autoFocus?: boolean;
  onSubmit: (query: string) => void;
}

const MIN = 2;
const MAX = 120;

const KIND_ICON: Record<SuggestionKind, typeof SparkIcon> = {
  modelo: SparkIcon,
  variante: LayersIcon,
  popular: TrendIcon,
  reciente: ClockIcon,
};

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Resalta en cada palabra la parte que el usuario ya escribió. */
function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = fold(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return <>{text}</>;
  const parts = text.split(/(\s+)/);
  return (
    <>
      {parts.map((part, i) => {
        const hit = tokens.find((tok) => fold(part).startsWith(tok));
        if (!hit || /^\s+$/.test(part)) return <span key={i}>{part}</span>;
        return (
          <span key={i}>
            <strong>{part.slice(0, hit.length)}</strong>
            {part.slice(hit.length)}
          </span>
        );
      })}
    </>
  );
}

/**
 * Cuadro de búsqueda con sugerencias (combobox accesible: flechas, Enter, Escape). Mezcla lo reciente de este
 * navegador con lo que sugiere el servidor: modelos, variantes y lo que otras personas buscan.
 */
export function SearchBox({ initial = '', variant = 'bar', autoFocus = false, onSubmit }: Props) {
  const { t } = useT();
  const country = useSettings((s) => s.country);
  const recent = useSettings((s) => s.recent);
  const removeRecent = useSettings((s) => s.removeRecent);

  const [value, setValue] = useState(initial);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => setValue(initial), [initial]);

  const typed = value.trim().replace(/\s+/g, ' ');
  const debounced = useDebounced(typed, 150);
  const askServer = debounced.length >= MIN;
  const { data } = useQuery({
    queryKey: ['suggest', country, debounced],
    queryFn: ({ signal }) => api.suggest(debounced, country, signal),
    enabled: askServer,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: false,
  });

  const options = useMemo<Suggestion[]>(() => {
    const needle = fold(typed);
    const mine: Suggestion[] = recent
      .filter((r) => !needle || fold(r).includes(needle))
      .slice(0, needle ? 3 : 6)
      .map((text) => ({ text, kind: 'reciente', brand: null, category: null }));
    const seen = new Set(mine.map((m) => fold(m.text)));
    const server = askServer && data ? data.suggestions.filter((s) => !seen.has(fold(s.text))) : [];
    return [...mine, ...server].slice(0, 10);
  }, [typed, recent, askServer, data]);

  const showList = open && options.length > 0;

  const submit = (raw: string) => {
    const clean = raw.trim().replace(/\s+/g, ' ').slice(0, MAX);
    if (clean.length < MIN) return;
    setOpen(false);
    setActive(-1);
    inputRef.current?.blur();
    onSubmit(clean);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Enter') {
      const chosen = active >= 0 ? options[active] : undefined;
      if (chosen) {
        e.preventDefault();
        submit(chosen.text);
      }
    } else if (e.key === 'Escape') {
      if (showList) {
        e.preventDefault();
        setOpen(false);
        setActive(-1);
      }
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <form
      className={`sbox sbox--${variant}`}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit(value);
      }}
    >
      <div className="sbox__field">
        <SearchIcon className="sbox__icon" />
        <input
          ref={inputRef}
          className="sbox__input"
          type="text"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={MAX}
          autoFocus={autoFocus}
          placeholder={t((d) => d.search.placeholder)}
          aria-label={t((d) => d.nav.search)}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          // En la portada lo reciente ya se ve abajo: la lista solo aparece al escribir. En la barra de resultados, al enfocar.
          onFocus={() => setOpen(variant === 'bar' || typed.length > 0)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        {value && (
          <button
            type="button"
            className="sbox__clear"
            aria-label={t((d) => d.search.clear)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setValue('');
              setActive(-1);
              inputRef.current?.focus();
            }}
          >
            <CloseIcon width={18} height={18} />
          </button>
        )}
        <button type="submit" className="sbox__go">
          {t((d) => d.search.button)}
        </button>
      </div>

      {showList && (
        <ul id={listId} className="sbox__list" role="listbox" aria-label={t((d) => d.search.suggestionsLabel)}>
          {options.map((o, i) => {
            const Icon = KIND_ICON[o.kind];
            return (
              <li
                key={`${o.kind}:${o.text}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={`sbox__opt${i === active ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => active !== i && setActive(i)}
                onClick={() => submit(o.text)}
              >
                <Icon className="sbox__opt-icon" width={18} height={18} />
                <span className="sbox__opt-text">
                  <Highlight text={o.text} query={typed} />
                </span>
                <span className="sbox__opt-kind">{t((d) => d.search.kind[o.kind])}</span>
                {o.kind === 'reciente' && (
                  <button
                    type="button"
                    className="sbox__opt-x"
                    aria-label={t((d) => d.search.forget)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeRecent(o.text);
                    }}
                  >
                    <CloseIcon width={16} height={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </form>
  );
}
