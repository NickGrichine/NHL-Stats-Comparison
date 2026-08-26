import { describe, expect, it } from 'vitest';

import { __testing, type CompareState } from '../src/state/useCompareState';

const { parseState, serialise } = __testing;

const defaults: CompareState = {
  kind: 'skaters',
  season: 20242025,
  gameType: 2,
  norm: 'pct',
  cohort: 'pos',
  picks: [],
};

describe('URL state', () => {
  it('falls back to defaults for an empty query string', () => {
    expect(parseState('', defaults)).toEqual(defaults);
  });

  it('reads a full comparison', () => {
    const state = parseState('?kind=goalies&season=19851986&gt=3&norm=raw&cohort=all&sel=8449001', defaults);

    expect(state).toEqual({
      kind: 'goalies',
      season: 19851986,
      gameType: 3,
      norm: 'raw',
      cohort: 'all',
      picks: [{ id: 8449001, season: 19851986 }],
    });
  });

  // The point of the whole `@season` syntax: one chart, two eras.
  it('pins a selection to its own season', () => {
    const state = parseState('?season=20242025&sel=8478402,8447400@19851986', defaults);

    expect(state.picks).toEqual([
      { id: 8478402, season: 20242025 },
      { id: 8447400, season: 19851986 },
    ]);
  });

  it('accepts career as a season', () => {
    expect(parseState('?season=career', defaults).season).toBe('career');
    expect(parseState('?season=20242025&sel=1@career', defaults).picks[0]?.season).toBe('career');
  });

  it('ignores junk instead of throwing', () => {
    const state = parseState('?kind=zamboni&season=banana&gt=9&sel=,,abc,', defaults);
    expect(state.kind).toBe('skaters');
    expect(state.season).toBe(20242025);
    expect(state.gameType).toBe(2);
    expect(state.picks).toEqual([]);
  });

  it('caps the number of selections', () => {
    const state = parseState('?sel=1,2,3,4,5,6', defaults);
    expect(state.picks).toHaveLength(4);
  });

  it('omits defaults so a shared link stays short', () => {
    expect(serialise({ ...defaults, picks: [{ id: 7, season: 20242025 }] })).toBe(
      '?kind=skaters&season=20242025&sel=7',
    );
  });

  it('spells out a season only when it differs from the page', () => {
    const query = serialise({
      ...defaults,
      picks: [
        { id: 7, season: 20242025 },
        { id: 8, season: 19851986 },
      ],
    });

    expect(query).toContain('sel=7%2C8%4019851986');
  });

  it('round-trips', () => {
    const original: CompareState = {
      kind: 'teams',
      season: 19671968,
      gameType: 3,
      norm: 'raw',
      cohort: 'all',
      picks: [{ id: 19, season: 19671968 }],
    };

    expect(parseState(serialise(original), defaults)).toEqual(original);
  });
});
