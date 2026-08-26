/**
 * Era-adjusted normalisation.
 *
 * The previous version of this app scaled every stat against a hardcoded cap
 * tuned to the 2024-25 top 100 — 130 points, 60 goals, and so on. Those caps
 * are meaningless outside the season they came from: apply them to 1917-18 and
 * every polygon collapses to a dot at the centre, apply them to a fourth-liner
 * and the chart says nothing.
 *
 * Percentile rank fixes that. A player is measured against the league he
 * actually played in, so Gretzky's 1985-86 is judged against 1985-86 and
 * McDavid's 2024-25 against 2024-25, and the two are then directly comparable
 * on a shared 0-100 axis.
 */

import type { StatRow } from '../types';
import { positionGroup } from './teams';

export interface CohortOptions {
  /** Games each team played that season, used to derive the qualifying line. */
  gamesInSeason?: number | null;
  /** Restrict to forwards, defence or goalies. */
  group?: 'F' | 'D' | 'G' | 'ALL';
  /** Override the games-played minimum outright. */
  minGames?: number;
}

/**
 * The minimum games played to enter the cohort.
 *
 * A fifth of the schedule is enough to filter out call-ups whose three-game
 * sample would otherwise sit at the 99th percentile for shooting percentage,
 * while keeping anyone who was genuinely a regular. Playoffs use a flat floor
 * because a swept team only plays four games.
 */
export function qualifyingGames(options: CohortOptions): number {
  if (typeof options.minGames === 'number') return options.minGames;
  const games = options.gamesInSeason;
  if (!games || !Number.isFinite(games)) return 1;
  return Math.max(1, Math.round(games * 0.2));
}

/** Rows that count towards the distribution a percentile is measured against. */
export function cohortRows(rows: StatRow[], options: CohortOptions = {}): StatRow[] {
  const minGames = qualifyingGames(options);
  const group = options.group ?? 'ALL';

  return rows.filter((row) => {
    const gp = Number(row.gp);
    if (Number.isFinite(gp) && gp < minGames) return false;
    if (group === 'ALL') return true;
    return positionGroup(typeof row.pos === 'string' ? row.pos : null) === group;
  });
}

/**
 * Sorted, non-null values per metric key. Built once per cohort and reused for
 * every entity on the chart.
 */
export type Distributions = Map<string, number[]>;

export function buildDistributions(rows: StatRow[], keys: string[]): Distributions {
  const distributions: Distributions = new Map();

  for (const key of keys) {
    const values: number[] = [];
    for (const row of rows) {
      const raw = row[key];
      if (raw === null || raw === undefined) continue;
      const n = Number(raw);
      if (Number.isFinite(n)) values.push(n);
    }
    values.sort((a, b) => a - b);
    distributions.set(key, values);
  }

  return distributions;
}

/** Index of the first element >= target. */
function lowerBound(sorted: number[], target: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((sorted[mid] as number) < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** Index of the first element > target. */
function upperBound(sorted: number[], target: number): number {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((sorted[mid] as number) <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * Mid-rank percentile: the share of the cohort a value beats, counting ties as
 * half. Mid-rank matters more than it sounds — plenty of skaters finish a
 * season with exactly 0 power-play goals, and without tie-handling every one of
 * them would read as the 0th percentile or all of them as the 40th.
 *
 * Returns 0-100, or null when the cohort has nothing to compare against.
 */
export function percentileRank(sorted: number[], value: number): number | null {
  const n = sorted.length;
  if (n === 0 || !Number.isFinite(value)) return null;
  if (n === 1) return 50;

  const below = lowerBound(sorted, value);
  const atOrBelow = upperBound(sorted, value);
  const ties = atOrBelow - below;
  return ((below + ties / 2) / n) * 100;
}

/**
 * Percentile for one entity on one metric, honouring inversion.
 *
 * For a stat where lower is better (goals against average, shots against per
 * game) the raw percentile is flipped, so a high score always means "good" and
 * a bigger polygon always means a better player.
 */
export function scoreMetric(
  distributions: Distributions,
  key: string,
  value: unknown,
  invert = false,
): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  const sorted = distributions.get(key);
  if (!sorted) return null;

  const rank = percentileRank(sorted, n);
  if (rank === null) return null;
  return invert ? 100 - rank : rank;
}

/**
 * Raw-value scaling, offered as an alternative view.
 *
 * Scales each axis against the cohort maximum rather than against rank, which
 * is the honest way to show "Gretzky had literally twice as many points as
 * anyone else" — information percentile rank deliberately flattens away.
 */
export function scaleMetric(
  distributions: Distributions,
  key: string,
  value: unknown,
  invert = false,
): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;

  const sorted = distributions.get(key);
  if (!sorted || sorted.length === 0) return null;

  const min = sorted[0] as number;
  const max = sorted[sorted.length - 1] as number;
  if (max === min) return 50;

  const ratio = (n - min) / (max - min);
  const clamped = Math.max(0, Math.min(1, ratio));
  return (invert ? 1 - clamped : clamped) * 100;
}
