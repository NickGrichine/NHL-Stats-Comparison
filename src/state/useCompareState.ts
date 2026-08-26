/**
 * Application state lives in the URL.
 *
 * There is no store. Every choice that defines a comparison — mode, season,
 * game type, who is being compared — is a query parameter, which means every
 * comparison is a link somebody can paste into Slack, and the back button does
 * exactly what a user expects for free.
 *
 *   ?kind=skaters&season=20242025&gt=2&norm=pct&cohort=pos&sel=8478402,8447400@19851986
 *
 * A selection may pin its own season with `@`, which is what makes cross-era
 * comparison possible: McDavid's 2024-25 against Gretzky's 1985-86 on one chart.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EntityKind, GameType, SeasonScope, Selection } from '../types';

export type Normalisation = 'pct' | 'raw';
export type CohortMode = 'pos' | 'all';

export interface CompareState {
  kind: EntityKind;
  season: SeasonScope;
  gameType: GameType;
  norm: Normalisation;
  cohort: CohortMode;
  /** Entities being compared, in chart order. */
  picks: { id: number; season: SeasonScope }[];
}

export const MAX_PICKS = 4;

const KINDS: EntityKind[] = ['skaters', 'goalies', 'teams'];

function parseSeason(raw: string | null, fallback: SeasonScope): SeasonScope {
  if (!raw) return fallback;
  if (raw === 'career') return 'career';
  const n = Number(raw);
  return Number.isFinite(n) && n > 19000000 ? n : fallback;
}

function parseState(search: string, defaults: CompareState): CompareState {
  const params = new URLSearchParams(search);

  const kindRaw = params.get('kind');
  const kind = KINDS.includes(kindRaw as EntityKind) ? (kindRaw as EntityKind) : defaults.kind;
  const season = parseSeason(params.get('season'), defaults.season);
  const gameType = params.get('gt') === '3' ? 3 : 2;
  const norm = params.get('norm') === 'raw' ? 'raw' : 'pct';
  const cohort = params.get('cohort') === 'all' ? 'all' : 'pos';

  const picks = (params.get('sel') ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, MAX_PICKS)
    .map((token) => {
      const [idPart, seasonPart] = token.split('@');
      const id = Number(idPart);
      return Number.isFinite(id)
        ? { id, season: parseSeason(seasonPart ?? null, season) }
        : null;
    })
    .filter((pick): pick is { id: number; season: SeasonScope } => pick !== null);

  return { kind, season, gameType, norm, cohort, picks };
}

function serialise(state: CompareState): string {
  const params = new URLSearchParams();
  params.set('kind', state.kind);
  params.set('season', String(state.season));
  if (state.gameType !== 2) params.set('gt', String(state.gameType));
  if (state.norm !== 'pct') params.set('norm', state.norm);
  if (state.cohort !== 'pos') params.set('cohort', state.cohort);

  if (state.picks.length > 0) {
    params.set(
      'sel',
      state.picks
        // Only spell out a season when it differs from the page's season,
        // so the common case stays a short, readable link.
        .map((pick) => (pick.season === state.season ? String(pick.id) : `${pick.id}@${pick.season}`))
        .join(','),
    );
  }

  return `?${params.toString()}`;
}

export function useCompareState(defaults: CompareState) {
  const [state, setState] = useState<CompareState>(() =>
    parseState(typeof window === 'undefined' ? '' : window.location.search, defaults),
  );

  // The back and forward buttons should move between comparisons.
  useEffect(() => {
    const onPop = () => setState(parseState(window.location.search, defaults));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [defaults]);

  const update = useCallback(
    (patch: Partial<CompareState> | ((previous: CompareState) => Partial<CompareState>)) => {
      setState((previous) => {
        const next = { ...previous, ...(typeof patch === 'function' ? patch(previous) : patch) };
        const url = `${window.location.pathname}${serialise(next)}`;
        // Replace rather than push: dragging a season slider should not bury
        // the back button under fifty history entries.
        window.history.replaceState(null, '', url);
        return next;
      });
    },
    [],
  );

  /** Push one history entry — used when a selection is added or removed. */
  const commit = useCallback((next: CompareState) => {
    window.history.pushState(null, '', `${window.location.pathname}${serialise(next)}`);
    setState(next);
  }, []);

  const selections = useMemo<Selection[]>(
    () =>
      state.picks.map((pick) => ({
        kind: state.kind,
        id: pick.id,
        season: pick.season,
        gameType: state.gameType,
      })),
    [state.picks, state.kind, state.gameType],
  );

  const addPick = useCallback(
    (id: number, season?: SeasonScope) => {
      setState((previous) => {
        if (previous.picks.length >= MAX_PICKS) return previous;
        const pickSeason = season ?? previous.season;
        if (previous.picks.some((p) => p.id === id && p.season === pickSeason)) return previous;
        const next = { ...previous, picks: [...previous.picks, { id, season: pickSeason }] };
        window.history.replaceState(null, '', `${window.location.pathname}${serialise(next)}`);
        return next;
      });
    },
    [],
  );

  const removePick = useCallback((index: number) => {
    setState((previous) => {
      const next = { ...previous, picks: previous.picks.filter((_, i) => i !== index) };
      window.history.replaceState(null, '', `${window.location.pathname}${serialise(next)}`);
      return next;
    });
  }, []);

  const shareUrl = useMemo(
    () =>
      typeof window === 'undefined'
        ? ''
        : `${window.location.origin}${window.location.pathname}${serialise(state)}`,
    [state],
  );

  return { state, update, commit, selections, addPick, removePick, shareUrl };
}

export const __testing = { parseState, serialise };
