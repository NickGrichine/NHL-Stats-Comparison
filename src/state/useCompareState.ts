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
 * A selection pins to one specific season by default — McDavid stays at
 * 2024-25 no matter how far you later browse, which is what makes a
 * multi-player or cross-era comparison ("McDavid's 2024-25 against Gretzky's
 * 1985-86") reliable rather than something that scatters the moment the
 * Season selector moves. `null` ("floating") is the opt-in exception: a
 * selection toggled to follow tracks whatever season the page is showing,
 * for the common case of watching one player's numbers move as you browse
 * without removing and re-adding them. `@season` in the URL spells out a
 * pin; its absence means floating.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EntityKind, GameType, SeasonScope, Selection } from '../types';

export type Normalisation = 'pct' | 'raw';
export type CohortMode = 'pos' | 'all';

export interface Pick {
  id: number;
  /** null = floats with `state.season`; a value = pinned to that season. */
  season: SeasonScope | null;
  /** The season this pick was first added at — where "un-following" returns it. */
  originalSeason: SeasonScope;
}

export interface CompareState {
  kind: EntityKind;
  season: SeasonScope;
  gameType: GameType;
  norm: Normalisation;
  cohort: CohortMode;
  /** Entities being compared, in chart order. */
  picks: Pick[];
}

export const MAX_PICKS = 4;

/** A pick's actual season for data-loading and display purposes. */
export function effectiveSeason(pick: Pick, pageSeason: SeasonScope): SeasonScope {
  return pick.season ?? pageSeason;
}

const KINDS: EntityKind[] = ['skaters', 'goalies', 'teams'];

function parseSeason(raw: string | null, fallback: SeasonScope): SeasonScope {
  if (!raw) return fallback;
  if (raw === 'career') return 'career';
  const n = Number(raw);
  return Number.isFinite(n) && n > 19000000 ? n : fallback;
}

/** Same as parseSeason, but a missing/invalid value means "floating", not a fallback. */
function parsePinnedSeason(raw: string | undefined): SeasonScope | null {
  if (!raw) return null;
  if (raw === 'career') return 'career';
  const n = Number(raw);
  return Number.isFinite(n) && n > 19000000 ? n : null;
}

function parseState(search: string, defaults: CompareState): CompareState {
  const params = new URLSearchParams(search);

  const kindRaw = params.get('kind');
  const kind = KINDS.includes(kindRaw as EntityKind) ? (kindRaw as EntityKind) : defaults.kind;
  const season = parseSeason(params.get('season'), defaults.season);
  const gameType = params.get('gt') === '3' ? 3 : 2;
  const normRaw = params.get('norm');
  const norm = normRaw === 'pct' || normRaw === 'raw' ? normRaw : defaults.norm;
  const cohortRaw = params.get('cohort');
  const cohort = cohortRaw === 'pos' || cohortRaw === 'all' ? cohortRaw : defaults.cohort;

  const picks = (params.get('sel') ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .slice(0, MAX_PICKS)
    .map((token) => {
      const [idPart, seasonPart] = token.split('@');
      const id = Number(idPart);
      if (!Number.isFinite(id)) return null;
      const pinned = parsePinnedSeason(seasonPart);
      // A freshly-loaded floating pick has no recorded "home" season yet —
      // treat wherever it's floating right now as that home, same as a pick
      // that was just added.
      return { id, season: pinned, originalSeason: pinned ?? season };
    })
    .filter((pick): pick is Pick => pick !== null);

  return { kind, season, gameType, norm, cohort, picks };
}

function serialise(state: CompareState): string {
  const params = new URLSearchParams();
  params.set('kind', state.kind);
  params.set('season', String(state.season));
  if (state.gameType !== 2) params.set('gt', String(state.gameType));
  // Always spelled out (unlike gameType's omit-if-default), because these two
  // have no single static default to omit against — the app's fallback lives
  // in FALLBACK_DEFAULTS and could change again.
  params.set('norm', state.norm);
  params.set('cohort', state.cohort);

  if (state.picks.length > 0) {
    params.set(
      'sel',
      state.picks
        // A pin is always spelled out, even when it happens to match the
        // page's current season — omitting it there would round-trip back
        // as floating and start following the page again.
        .map((pick) => (pick.season === null ? String(pick.id) : `${pick.id}@${pick.season}`))
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
        season: effectiveSeason(pick, state.season),
        gameType: state.gameType,
      })),
    [state.picks, state.kind, state.season, state.gameType],
  );

  const addPick = useCallback(
    // `season` set is an explicit cross-era pin (from the "Other seasons"
    // search); omitted is a normal in-season pick — pinned to the page's
    // current season all the same, so it does not drift if the page later
    // does. Nothing floats until the visitor asks it to, via toggleFollow.
    (id: number, season?: SeasonScope) => {
      setState((previous) => {
        if (previous.picks.length >= MAX_PICKS) return previous;
        const pinnedSeason = season ?? previous.season;
        const isDuplicate = previous.picks.some(
          (p) => p.id === id && effectiveSeason(p, previous.season) === pinnedSeason,
        );
        if (isDuplicate) return previous;
        const next = {
          ...previous,
          picks: [...previous.picks, { id, season: pinnedSeason, originalSeason: pinnedSeason }],
        };
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

  /**
   * Flip one pick between pinned and floating. Un-following returns it to the
   * season it was originally added at — not wherever the page happens to be
   * browsing at the moment you flip it back — so toggling "live" on and off
   * to check a player against a couple of other seasons doesn't leave the
   * pick stranded somewhere new.
   */
  const toggleFollow = useCallback((index: number) => {
    setState((previous) => {
      const pick = previous.picks[index];
      if (!pick) return previous;
      const nextSeason = pick.season === null ? pick.originalSeason : null;
      const next = {
        ...previous,
        picks: previous.picks.map((p, i) => (i === index ? { ...p, season: nextSeason } : p)),
      };
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

  return { state, update, commit, selections, addPick, removePick, toggleFollow, shareUrl };
}

export const __testing = { parseState, serialise };
