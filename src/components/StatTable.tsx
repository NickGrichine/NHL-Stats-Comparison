import { Fragment } from 'react';

import { metricsByGroup, type Metric } from '../lib/metrics';
import { positionName, teamNames } from '../lib/teams';
import type { StatRow } from '../types';
import type { Series } from './RadarCompare';

interface Props {
  series: Series[];
  metrics: Metric[];
  kind: string;
}

/** Which column holds the best value, so it can be marked. */
function bestIndex(series: Series[], metric: Metric): number | null {
  let best = -1;
  let bestValue = Number.NaN;
  const distinct = new Set<number>();

  for (let index = 0; index < series.length; index += 1) {
    const raw = series[index]?.row[metric.key];
    if (raw === null || raw === undefined) continue;

    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    distinct.add(value);

    const better = Number.isNaN(bestValue)
      ? true
      : metric.invert
        ? value < bestValue
        : value > bestValue;

    if (better) {
      bestValue = value;
      best = index;
    }
  }

  // Marking a "winner" when everyone is tied is noise, not information.
  if (best === -1 || distinct.size < 2) return null;
  return best;
}

function contextCell(row: StatRow, kind: string): string {
  if (kind === 'teams') return String(row.abbrev ?? '');
  return [positionName(typeof row.pos === 'string' ? row.pos : null)].filter(Boolean).join(' ');
}

export function StatTable({ series, metrics, kind }: Props) {
  if (series.length === 0) return null;

  const groups = metricsByGroup(metrics);

  return (
    <div className="table-scroll">
      <table className="stat-table">
        <caption className="sr-only">
          Statistical comparison. The strongest value in each row is highlighted.
        </caption>
        <thead>
          <tr>
            <th scope="col">Stat</th>
            {series.map((entry) => (
              <th key={entry.label} scope="col">
                <span className="swatch" style={{ background: entry.color }} aria-hidden="true" />
                {entry.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          <tr className="context-row">
            <th scope="row">{kind === 'teams' ? 'Code' : 'Position'}</th>
            {series.map((entry) => (
              <td key={entry.label}>{contextCell(entry.row, kind) || '—'}</td>
            ))}
          </tr>

          {kind !== 'teams' && (
            <tr className="context-row">
              <th scope="row">Team</th>
              {series.map((entry) => (
                <td
                  key={entry.label}
                  title={teamNames(typeof entry.row.teams === 'string' ? entry.row.teams : null)}
                >
                  {String(entry.row.teams ?? '—')}
                </td>
              ))}
            </tr>
          )}

          {groups.map(([group, groupMetrics]) => (
            <Fragment key={group}>
              <tr className="group-row">
                <th scope="rowgroup" colSpan={series.length + 1}>
                  {group}
                </th>
              </tr>

              {groupMetrics.map((metric) => {
                const winner = bestIndex(series, metric);
                return (
                  <tr key={metric.key}>
                    <th scope="row">
                      <abbr title={metric.label}>{metric.short}</abbr>
                    </th>
                    {series.map((entry, index) => (
                      <td
                        key={entry.label}
                        className={index === winner ? 'is-best' : undefined}
                      >
                        {metric.format(entry.row[metric.key])}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
