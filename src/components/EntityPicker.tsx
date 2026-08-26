import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import type { PlayerIndexEntry, SeasonScope, StatRow } from '../types';
import { formatSeasonId } from '../../shared/seasons.mjs';
import { teamNames } from '../lib/teams';

interface Props {
  /** Everyone available in the currently selected season. */
  rows: StatRow[];
  /** Every player who ever played, for the "other seasons" suggestions. */
  index: PlayerIndexEntry[];
  season: SeasonScope;
  kind: string;
  disabled?: boolean;
  onPick: (id: number, season?: SeasonScope) => void;
}

interface Option {
  id: number;
  name: string;
  detail: string;
  season?: SeasonScope;
}

const MAX_RESULTS = 8;

/**
 * A search box that behaves like a real combobox.
 *
 * v1's dropdown was mouse-only — no arrow keys, no Enter, no announcement to a
 * screen reader. This one implements the ARIA combobox pattern properly, and it
 * searches two populations at once: the season you are looking at, and every
 * other season in NHL history, so typing "Gretzky" while sitting on 2024-25
 * still finds him and offers to jump to a season he actually played.
 */
export function EntityPicker({ rows, index, season, kind, disabled, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const inSeason = useMemo<Option[]>(() => {
    const needle = query.trim().toLowerCase();
    const source = needle
      ? rows.filter((row) => String(row.name).toLowerCase().includes(needle))
      : rows;

    return source.slice(0, MAX_RESULTS).map((row) => ({
      id: row.id,
      name: String(row.name),
      detail:
        kind === 'teams'
          ? `${row.w ?? '–'}-${row.l ?? '–'} · ${row.pts ?? '–'} pts`
          : [row.pos, teamNames(typeof row.teams === 'string' ? row.teams : null)]
              .filter(Boolean)
              .join(' · '),
    }));
  }, [rows, query, kind]);

  const elsewhere = useMemo<Option[]>(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2 || kind === 'teams') return [];

    const present = new Set(inSeason.map((option) => option.id));
    return index
      .filter((entry) => !present.has(entry.id) && entry.name.toLowerCase().includes(needle))
      .slice(0, MAX_RESULTS)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        // Landing on a player's final season is the most useful default —
        // it is usually their most complete statistical record.
        season: entry.last,
        detail: `${formatSeasonId(entry.first)} – ${formatSeasonId(entry.last)}${
          entry.pos ? ` · ${entry.pos}` : ''
        }`,
      }));
  }, [index, query, inSeason, kind]);

  const options = useMemo(() => [...inSeason, ...elsewhere], [inSeason, elsewhere]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onDocumentClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [open]);

  const choose = (option: Option | undefined) => {
    if (!option) return;
    onPick(option.id, option.season ?? season);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + delta + options.length) % Math.max(1, options.length));
      return;
    }

    if (event.key === 'Enter') {
      if (open && options.length > 0) {
        event.preventDefault();
        choose(options[active]);
      }
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (event.key === 'Home' && open) {
      event.preventDefault();
      setActive(0);
    }

    if (event.key === 'End' && open) {
      event.preventDefault();
      setActive(Math.max(0, options.length - 1));
    }
  };

  const label = kind === 'teams' ? 'Add a team' : kind === 'goalies' ? 'Add a goalie' : 'Add a player';

  return (
    <div className="picker" ref={rootRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
        aria-label={label}
        placeholder={label}
        value={query}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      <button
        type="button"
        className="picker-toggle"
        aria-label={open ? 'Hide suggestions' : 'Show suggestions'}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
      >
        ▾
      </button>

      {open && (
        <ul className="picker-list" id={listId} role="listbox" aria-label={label}>
          {options.length === 0 && <li className="picker-empty">No matches</li>}

          {options.map((option, position) => {
            const isElsewhere = position >= inSeason.length;
            const isFirstElsewhere = isElsewhere && position === inSeason.length;

            return (
              <li key={`${option.id}-${option.season ?? 'now'}`}>
                {isFirstElsewhere && (
                  <div className="picker-group" role="presentation">
                    Other seasons
                  </div>
                )}
                <div
                  id={`${listId}-${position}`}
                  role="option"
                  aria-selected={position === active}
                  className={`picker-option${position === active ? ' is-active' : ''}`}
                  onMouseEnter={() => setActive(position)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    choose(option);
                  }}
                >
                  <span className="picker-name">{option.name}</span>
                  <span className="picker-detail">{option.detail}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
