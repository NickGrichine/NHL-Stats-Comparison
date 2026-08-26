import { describe, expect, it } from 'vitest';

import {
  buildDistributions,
  cohortRows,
  percentileRank,
  qualifyingGames,
  scaleMetric,
  scoreMetric,
} from '../src/lib/percentile';
import type { StatRow } from '../src/types';

const row = (over: Partial<StatRow>): StatRow =>
  ({ id: 1, name: 'Test', gp: 82, pos: 'C', ...over }) as StatRow;

describe('percentileRank', () => {
  const sorted = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

  it('puts the lowest value near the bottom and the highest near the top', () => {
    expect(percentileRank(sorted, 0)).toBeCloseTo(5);
    expect(percentileRank(sorted, 9)).toBeCloseTo(95);
  });

  it('places the median in the middle', () => {
    expect(percentileRank(sorted, 4)).toBeCloseTo(45);
    expect(percentileRank(sorted, 5)).toBeCloseTo(55);
  });

  // Without mid-rank handling, the hundreds of skaters who finish a season with
  // exactly zero power-play goals would all read as the 0th percentile.
  it('splits ties down the middle instead of collapsing them', () => {
    const withTies = [0, 0, 0, 0, 5, 6, 7, 8, 9, 10];
    expect(percentileRank(withTies, 0)).toBeCloseTo(20);
  });

  it('handles a value outside the observed range', () => {
    expect(percentileRank(sorted, -5)).toBe(0);
    expect(percentileRank(sorted, 99)).toBe(100);
  });

  it('returns 50 for a cohort of one and null for a cohort of none', () => {
    expect(percentileRank([7], 7)).toBe(50);
    expect(percentileRank([], 7)).toBeNull();
  });

  it('rejects non-finite input', () => {
    expect(percentileRank(sorted, Number.NaN)).toBeNull();
  });
});

describe('qualifyingGames', () => {
  it('uses a fifth of the schedule', () => {
    expect(qualifyingGames({ gamesInSeason: 82 })).toBe(16);
    expect(qualifyingGames({ gamesInSeason: 70 })).toBe(14);
  });

  it('falls back to one game when the schedule length is unknown', () => {
    expect(qualifyingGames({ gamesInSeason: null })).toBe(1);
    expect(qualifyingGames({})).toBe(1);
  });

  it('lets the caller override outright, for playoffs and careers', () => {
    expect(qualifyingGames({ gamesInSeason: 82, minGames: 3 })).toBe(3);
  });
});

describe('cohortRows', () => {
  const rows = [
    row({ id: 1, gp: 82, pos: 'C' }),
    row({ id: 2, gp: 4, pos: 'C' }),
    row({ id: 3, gp: 60, pos: 'D' }),
    row({ id: 4, gp: 70, pos: 'L' }),
  ];

  it('drops players below the qualifying line', () => {
    const kept = cohortRows(rows, { gamesInSeason: 82 });
    expect(kept.map((r) => r.id)).toEqual([1, 3, 4]);
  });

  it('groups wingers with centres but keeps defencemen separate', () => {
    expect(cohortRows(rows, { gamesInSeason: 82, group: 'F' }).map((r) => r.id)).toEqual([1, 4]);
    expect(cohortRows(rows, { gamesInSeason: 82, group: 'D' }).map((r) => r.id)).toEqual([3]);
  });

  it('keeps everyone when the group is ALL', () => {
    expect(cohortRows(rows, { minGames: 1, group: 'ALL' })).toHaveLength(4);
  });
});

describe('scoreMetric', () => {
  const rows = [row({ p: 10 }), row({ p: 20 }), row({ p: 30 }), row({ p: 40 })];
  const distributions = buildDistributions(rows, ['p', 'gaa']);

  it('scores a top value high and a bottom value low', () => {
    expect(scoreMetric(distributions, 'p', 40)).toBeGreaterThan(80);
    expect(scoreMetric(distributions, 'p', 10)).toBeLessThan(20);
  });

  // Goals against average, shots against, giveaways: a low number is a good
  // number, so the polygon must still grow outward for a better performance.
  it('flips the scale for a stat where lower is better', () => {
    const gaa = buildDistributions(
      [row({ gaa: 2.0 }), row({ gaa: 2.5 }), row({ gaa: 3.0 }), row({ gaa: 3.5 })],
      ['gaa'],
    );

    const best = scoreMetric(gaa, 'gaa', 2.0, true);
    const worst = scoreMetric(gaa, 'gaa', 3.5, true);
    expect(best).toBeGreaterThan(worst as number);
    expect(best).toBeGreaterThan(80);
  });

  it('returns null rather than zero for a stat the league never tracked', () => {
    expect(scoreMetric(distributions, 'p', null)).toBeNull();
    expect(scoreMetric(distributions, 'hits', 12)).toBeNull();
  });

  it('ignores rows whose value is missing when building the distribution', () => {
    const sparse = buildDistributions([row({ p: 10 }), row({ p: null }), row({ p: 30 })], ['p']);
    expect(sparse.get('p')).toEqual([10, 30]);
  });
});

describe('scaleMetric', () => {
  const distributions = buildDistributions(
    [row({ p: 10 }), row({ p: 20 }), row({ p: 100 })],
    ['p'],
  );

  // Percentile deliberately flattens margin of victory; raw range is the view
  // that shows a player lapping the field.
  it('scales against the observed range, not the rank', () => {
    expect(scaleMetric(distributions, 'p', 100)).toBe(100);
    expect(scaleMetric(distributions, 'p', 10)).toBe(0);
    expect(scaleMetric(distributions, 'p', 55)).toBeCloseTo(50);
  });

  it('clamps a value outside the range', () => {
    expect(scaleMetric(distributions, 'p', 500)).toBe(100);
    expect(scaleMetric(distributions, 'p', -5)).toBe(0);
  });

  it('returns the midpoint when everyone is identical', () => {
    const flat = buildDistributions([row({ p: 5 }), row({ p: 5 })], ['p']);
    expect(scaleMetric(flat, 'p', 5)).toBe(50);
  });
});
