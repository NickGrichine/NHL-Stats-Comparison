import { useAsync } from '../api/useDataset';
import { loadLive } from '../api/datasets';
import { fmtPct } from '../lib/format';

interface StandingRow {
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
  goalDifferential?: number;
}

interface StandingsPayload {
  standings?: StandingRow[];
}

/** Current standings, grouped by division, refreshed hourly with the scoreboard. */
export function Standings() {
  const { data, loading, error } = useAsync(() => loadLive<StandingsPayload>('standings'), []);

  if (loading) return <p className="muted">Loading standings…</p>;
  if (error || !data) return null;

  const rows = data.payload?.standings ?? [];
  if (rows.length === 0) {
    return <p className="muted">Standings appear once the season is under way.</p>;
  }

  const divisions = new Map<string, StandingRow[]>();
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
