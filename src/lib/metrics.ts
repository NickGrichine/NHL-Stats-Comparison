/**
 * Which stats exist, what they are called, and how they are shown.
 *
 * One definition drives three things — the radar axes, the comparison table,
 * and the percentile engine — so a stat can never be labelled one way on the
 * chart and another in the table.
 */

import type { EntityKind, StatRow } from '../types';
import {
  fmtDecimal,
  fmtInt,
  fmtPct,
  fmtSavePct,
  fmtSigned,
  fmtTime,
  fmtTotalTime,
} from './format';

export interface Metric {
  /** Field name on a StatRow. */
  key: string;
  /** Abbreviation shown on the radar axis. */
  short: string;
  /** Full name, revealed on hover — the behaviour v1 users already know. */
  label: string;
  format: (value: unknown) => string;
  /** True when a lower number is better, so the percentile gets flipped. */
  invert?: boolean;
  /** Part of the default radar set. */
  radar?: boolean;
  /** Table section heading. */
  group: string;
}

const one = fmtDecimal(1);
const two = fmtDecimal(2);

export const SKATER_METRICS: Metric[] = [
  { key: 'gp', short: 'GP', label: 'Games Played', format: fmtInt, group: 'Scoring' },
  { key: 'g', short: 'G', label: 'Goals', format: fmtInt, radar: true, group: 'Scoring' },
  { key: 'a', short: 'A', label: 'Assists', format: fmtInt, radar: true, group: 'Scoring' },
  { key: 'p', short: 'P', label: 'Points', format: fmtInt, radar: true, group: 'Scoring' },
  { key: 'pGp', short: 'P/GP', label: 'Points Per Game', format: two, radar: true, group: 'Scoring' },

  { key: 'evG', short: 'EVG', label: 'Even Strength Goals', format: fmtInt, group: 'Situational' },
  { key: 'evP', short: 'EVP', label: 'Even Strength Points', format: fmtInt, radar: true, group: 'Situational' },
  { key: 'ppG', short: 'PPG', label: 'Power Play Goals', format: fmtInt, group: 'Situational' },
  { key: 'ppP', short: 'PPP', label: 'Power Play Points', format: fmtInt, radar: true, group: 'Situational' },
  { key: 'shG', short: 'SHG', label: 'Short Handed Goals', format: fmtInt, group: 'Situational' },
  { key: 'shP', short: 'SHP', label: 'Short Handed Points', format: fmtInt, group: 'Situational' },
  { key: 'gwg', short: 'GWG', label: 'Game Winning Goals', format: fmtInt, group: 'Situational' },
  { key: 'otg', short: 'OTG', label: 'Overtime Goals', format: fmtInt, group: 'Situational' },

  { key: 'sog', short: 'S', label: 'Shots on Goal', format: fmtInt, group: 'Shooting' },
  { key: 'sPct', short: 'S%', label: 'Shooting Percentage', format: (v) => fmtPct(v, 1), radar: true, group: 'Shooting' },

  { key: 'toi', short: 'TOI/GP', label: 'Time on Ice Per Game', format: fmtTime, radar: true, group: 'Usage' },
  { key: 'pm', short: '+/-', label: 'Plus/Minus', format: fmtSigned, group: 'Usage' },
  { key: 'pim', short: 'PIM', label: 'Penalty Minutes', format: fmtInt, group: 'Usage' },
  { key: 'foPct', short: 'FO%', label: 'Faceoff Win Percentage', format: (v) => fmtPct(v, 1), group: 'Usage' },

  { key: 'hits', short: 'HIT', label: 'Hits', format: fmtInt, group: 'Physical' },
  { key: 'blk', short: 'BLK', label: 'Blocked Shots', format: fmtInt, group: 'Physical' },
  { key: 'tka', short: 'TK', label: 'Takeaways', format: fmtInt, group: 'Physical' },
  { key: 'gva', short: 'GV', label: 'Giveaways', format: fmtInt, invert: true, group: 'Physical' },
];

export const GOALIE_METRICS: Metric[] = [
  { key: 'gp', short: 'GP', label: 'Games Played', format: fmtInt, radar: true, group: 'Workload' },
  { key: 'gs', short: 'GS', label: 'Games Started', format: fmtInt, group: 'Workload' },
  { key: 'toi', short: 'TOI', label: 'Total Time on Ice', format: fmtTotalTime, group: 'Workload' },
  { key: 'sa', short: 'SA', label: 'Shots Against', format: fmtInt, radar: true, group: 'Workload' },

  { key: 'svPct', short: 'SV%', label: 'Save Percentage', format: fmtSavePct, radar: true, group: 'Results' },
  { key: 'gaa', short: 'GAA', label: 'Goals Against Average', format: two, invert: true, radar: true, group: 'Results' },
  { key: 'sv', short: 'SV', label: 'Saves', format: fmtInt, radar: true, group: 'Results' },
  { key: 'ga', short: 'GA', label: 'Goals Against', format: fmtInt, invert: true, group: 'Results' },
  { key: 'so', short: 'SO', label: 'Shutouts', format: fmtInt, radar: true, group: 'Results' },

  { key: 'w', short: 'W', label: 'Wins', format: fmtInt, radar: true, group: 'Record' },
  { key: 'l', short: 'L', label: 'Losses', format: fmtInt, invert: true, group: 'Record' },
  { key: 'otl', short: 'OTL', label: 'Overtime Losses', format: fmtInt, invert: true, group: 'Record' },
  { key: 't', short: 'T', label: 'Ties', format: fmtInt, group: 'Record' },

  { key: 'g', short: 'G', label: 'Goals', format: fmtInt, group: 'Skating' },
  { key: 'a', short: 'A', label: 'Assists', format: fmtInt, group: 'Skating' },
  { key: 'pim', short: 'PIM', label: 'Penalty Minutes', format: fmtInt, group: 'Skating' },
];

export const TEAM_METRICS: Metric[] = [
  { key: 'gp', short: 'GP', label: 'Games Played', format: fmtInt, group: 'Record' },
  { key: 'w', short: 'W', label: 'Wins', format: fmtInt, group: 'Record' },
  { key: 'l', short: 'L', label: 'Losses', format: fmtInt, invert: true, group: 'Record' },
  { key: 'otl', short: 'OTL', label: 'Overtime Losses', format: fmtInt, invert: true, group: 'Record' },
  { key: 't', short: 'T', label: 'Ties', format: fmtInt, group: 'Record' },
  { key: 'pts', short: 'PTS', label: 'Points', format: fmtInt, group: 'Record' },
  { key: 'ptPct', short: 'PT%', label: 'Points Percentage', format: (v) => fmtPct(v, 1), radar: true, group: 'Record' },
  { key: 'row', short: 'ROW', label: 'Regulation and Overtime Wins', format: fmtInt, group: 'Record' },
  { key: 'winsReg', short: 'RW', label: 'Regulation Wins', format: fmtInt, group: 'Record' },
  { key: 'winsSo', short: 'SOW', label: 'Shootout Wins', format: fmtInt, group: 'Record' },

  { key: 'gf', short: 'GF', label: 'Goals For', format: fmtInt, group: 'Offence' },
  { key: 'gfGp', short: 'GF/GP', label: 'Goals For Per Game', format: two, radar: true, group: 'Offence' },
  { key: 'sfGp', short: 'SF/GP', label: 'Shots For Per Game', format: one, radar: true, group: 'Offence' },
  { key: 'ppPct', short: 'PP%', label: 'Power Play Percentage', format: (v) => fmtPct(v, 1), radar: true, group: 'Offence' },

  { key: 'ga', short: 'GA', label: 'Goals Against', format: fmtInt, invert: true, group: 'Defence' },
  { key: 'gaGp', short: 'GA/GP', label: 'Goals Against Per Game', format: two, invert: true, radar: true, group: 'Defence' },
  { key: 'saGp', short: 'SA/GP', label: 'Shots Against Per Game', format: one, invert: true, radar: true, group: 'Defence' },
  { key: 'pkPct', short: 'PK%', label: 'Penalty Kill Percentage', format: (v) => fmtPct(v, 1), radar: true, group: 'Defence' },
  { key: 'so', short: 'SO', label: 'Shutouts', format: fmtInt, group: 'Defence' },

  { key: 'foPct', short: 'FO%', label: 'Faceoff Win Percentage', format: (v) => fmtPct(v, 1), radar: true, group: 'Other' },
];

export const METRICS: Record<EntityKind, Metric[]> = {
  skaters: SKATER_METRICS,
  goalies: GOALIE_METRICS,
  teams: TEAM_METRICS,
};

/**
 * Every EntityKind is a key of METRICS, but `noUncheckedIndexedAccess` cannot
 * know that, so route lookups through here rather than sprinkling assertions.
 */
export function metricsFor(kind: EntityKind): Metric[] {
  return METRICS[kind] ?? SKATER_METRICS;
}

/**
 * Keep only the metrics the league actually tracked for this dataset.
 *
 * The pipeline drops columns that are null for a whole season, so absence in
 * the data is the authoritative answer to "did hits exist in 1943" — far more
 * reliable than a hardcoded table of when each stat was introduced. Anything
 * missing simply never becomes an axis, instead of being plotted as a zero and
 * quietly libelling every player of that era.
 */
export function availableMetrics(kind: EntityKind, rows: StatRow[]): Metric[] {
  const all = metricsFor(kind);
  if (rows.length === 0) return all;

  // Sampling is enough: a stat the league tracked is present on essentially
  // every row, and scanning 963 rows x 24 metrics on every render is waste.
  const sample = rows.length > 200 ? rows.slice(0, 200) : rows;

  return all.filter((metric) =>
    sample.some((row) => {
      const value = row[metric.key];
      return value !== null && value !== undefined;
    }),
  );
}

export function radarMetrics(kind: EntityKind, rows: StatRow[]): Metric[] {
  const available = availableMetrics(kind, rows).filter((metric) => metric.radar);
  // A three-axis radar is a triangle and reads as noise; fall back to whatever
  // else is available so an ancient season still renders something sensible.
  if (available.length >= 4) return available;
  return availableMetrics(kind, rows).slice(0, 8);
}

export function metricsByGroup(metrics: Metric[]): [string, Metric[]][] {
  const groups = new Map<string, Metric[]>();
  for (const metric of metrics) {
    const list = groups.get(metric.group);
    if (list) list.push(metric);
    else groups.set(metric.group, [metric]);
  }
  return [...groups.entries()];
}
