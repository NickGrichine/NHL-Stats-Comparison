import { useState } from 'react';

import { loadDataset, loadLive } from '../api/datasets';
import { useAsync } from '../api/useDataset';
import { fmtInt, fmtPct } from '../lib/format';
import type { Manifest } from '../types';

interface LiveStandingRow {
  teamName?: { default?: string };
  teamAbbrev?: { default?: string };
  conferenceName?: string;
  divisionName?: string;
  gamesPlayed?: number;
  wins?: number;
  losses?: number;
  otLosses?: number;
  points?: number;
  pointPctg?: number;
}

interface LiveStandingsPayload {
  standings?: LiveStandingRow[];
}

type SeasonChoice = 'live' | number;

/** The NHL's current, division-grouped standings feed — refreshed hourly. */
function LiveStandings() {
  const { data, loading, error } = useAsync(() => loadLive<LiveStandingsPayload>('standings'), []);

  if (loading) return <p className="muted">Loading standings…</p>;
  if (error || !data) return null;

  const rows = data.payload?.standings ?? [];
  if (rows.length === 0) {
    return <p className="muted">Standings appear once the season is under way.</p>;
  }

  const divisions = new Map<string, LiveStandingRow[]>();
  for (const row of rows) {
    const key = row.divisionName ?? row.conferenceName ?? 'League';
    const list = divisions.get(key);
    if (list) list.push(row);
    else divisions.set(key, [row]);
  }

  return (
    <div className="standings-grid">
      {[...divisions.entries()].map(([division, teams]) => (
        <div key={division} className="table-scroll">
          <table className="stat-table compact">
            <caption>{division}</caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">GP</th>
                <th scope="col">W</th>
                <th scope="col">L</th>
                <th scope="col">OTL</th>
                <th scope="col">PTS</th>
                <th scope="col">P%</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.teamAbbrev?.default ?? team.teamName?.default}>
                  <th scope="row">{team.teamAbbrev?.default ?? team.teamName?.default ?? '—'}</th>
                  <td>{team.gamesPlayed ?? '—'}</td>
                  <td>{team.wins ?? '—'}</td>
                  <td>{team.losses ?? '—'}</td>
                  <td>{team.otLosses ?? '—'}</td>
                  <td className="is-best">{team.points ?? '—'}</td>
                  <td>{fmtPct(team.pointPctg, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

/** A single season's final table, built from the same per-team season data the rest of the app compares. */
function SeasonStandings({ season }: { season: number }) {
  const { data, loading, error } = useAsync(() => loadDataset('teams', season, 2), [season]);

  if (loading) return <p className="muted">Loading standings…</p>;
  if (error) return null;

  const rows = [...(data ?? [])].sort((a, b) => {
    const byPoints = (Number(b.pts) || 0) - (Number(a.pts) || 0);
    return byPoints !== 0 ? byPoints : (Number(b.ptPct) || 0) - (Number(a.ptPct) || 0);
  });

  if (rows.length === 0) {
    return <p className="muted">Standings appear once the season is under way.</p>;
  }

  return (
    <div className="table-scroll">
      <table className="stat-table compact">
        <thead>
          <tr>
            <th scope="col">Team</th>
            <th scope="col">GP</th>
            <th scope="col">W</th>
            <th scope="col">L</th>
            <th scope="col">OTL</th>
            <th scope="col">PTS</th>
            <th scope="col">P%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{String(row.abbrev ?? row.name ?? '—')}</th>
              <td>{fmtInt(row.gp)}</td>
              <td>{fmtInt(row.w)}</td>
              <td>{fmtInt(row.l)}</td>
              <td>{fmtInt(row.otl)}</td>
              <td className="is-best">{fmtInt(row.pts)}</td>
              <td>{fmtPct(row.ptPct, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface Props {
  manifest: Manifest | null;
}

/** Current standings by default, or any season on record — including one that hasn't started yet. */
export function Standings({ manifest }: Props) {
  const [choice, setChoice] = useState<SeasonChoice>('live');
  const seasons = manifest?.seasons ?? [];

  return (
    <>
      <label className="field field-season">
        <span>Season</span>
        <select
          value={String(choice)}
          onChange={(event) => {
            const raw = event.target.value;
            setChoice(raw === 'live' ? 'live' : Number(raw));
          }}
        >
          <option value="live">Current</option>
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.label}
            </option>
          ))}
        </select>
      </label>

      {choice === 'live' ? <LiveStandings /> : <SeasonStandings season={choice} />}
    </>
  );
}
