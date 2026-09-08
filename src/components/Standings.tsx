import { useState } from 'react';

import { loadDataset } from '../api/datasets';
import { useAsync } from '../api/useDataset';
import { fmtInt } from '../lib/format';
import { teamLogoUrl, teamShortName } from '../lib/teams';
import type { Manifest, StatRow } from '../types';

/** The NHL marks a team's final regular-season clinch with one of these letters. */
const CLINCH_CODES = new Set(['p', 'z', 'y', 'x']);

/** Presidents' Trophy gets its own highlight; every other clinch (division, conference, wild card) shares one. */
function clinchRowClass(code: unknown): string {
  if (code === 'p') return 'clinch-trophy';
  if (typeof code === 'string' && CLINCH_CODES.has(code)) return 'clinch-playoff';
  return '';
}

/** Seasons where the NHL's own data has no clinch info for a specific, notable reason. */
const CLINCH_GAP_NOTES: Record<number, string> = {
  20192020:
    'Clinch data isn’t available for 2019-20 — the season was suspended in March 2020 because of COVID-19 and never finished a normal stretch run.',
};

const COLUMNS: { key: string; label: string; title: string }[] = [
  { key: 'gp', label: 'GP', title: 'Games Played' },
  { key: 'w', label: 'W', title: 'Wins' },
  { key: 'l', label: 'L', title: 'Losses' },
  { key: 'otl', label: 'OTL', title: 'Overtime / Shootout Losses' },
  { key: 'pts', label: 'PTS', title: 'Points' },
];

type DivisionGroup = [string, StatRow[]];

/**
 * The 2020-21 COVID realignment named its divisions after title sponsors
 * ("Honda West", "MassMutual East") rather than the plain geographic names
 * the NHL itself used everywhere else that season — trimmed here so the
 * standings read the same way as every other year's.
 */
const DIVISION_NAME_OVERRIDES: Record<string, string> = {
  'Discover Central': 'Central',
  'Honda West': 'West',
  'MassMutual East': 'East',
  'Scotia North': 'North',
};

function cleanDivisionName(name: string): string {
  return DIVISION_NAME_OVERRIDES[name] ?? name;
}

/**
 * Groups teams by the division/conference structure actually in effect that
 * season. Sorted by conference then division name so realignment eras (the
 * COVID-shortened 2020-21 season's geographic divisions, old Norris/Adams/
 * Patrick/Smythe-style splits, and so on) come out in a stable, readable
 * order instead of whatever order teams happened to be fetched in.
 */
function groupByDivision(rows: StatRow[]): DivisionGroup[] {
  const groups = new Map<string, StatRow[]>();
  for (const row of rows) {
    const key = cleanDivisionName(
      (typeof row.division === 'string' && row.division) ||
        (typeof row.conference === 'string' && row.conference) ||
        'League',
    );
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  const sortKey = (list: StatRow[]) => {
    const first = list[0];
    const conference = typeof first?.conference === 'string' ? first.conference : '';
    const division = typeof first?.division === 'string' ? cleanDivisionName(first.division) : '';
    return `${conference}::${division}`;
  };

  return [...groups.entries()].sort(([, a], [, b]) => sortKey(a).localeCompare(sortKey(b)));
}

/**
 * Nests division groups under their conference — Western's divisions stacked
 * above Eastern's — when every division actually belongs to one. Older or
 * realigned seasons that never had (or don't fully report) a conference layer
 * fall back to a single flat section, same as before conferences existed.
 */
function groupByConference(divisions: DivisionGroup[]): [string, DivisionGroup[]][] | null {
  const conferenceOf = (group: DivisionGroup) => {
    const first = group[1][0];
    return typeof first?.conference === 'string' ? first.conference : null;
  };

  if (!divisions.every((group) => conferenceOf(group))) return null;

  const byConference = new Map<string, DivisionGroup[]>();
  for (const group of divisions) {
    const conference = conferenceOf(group) as string;
    const list = byConference.get(conference);
    if (list) list.push(group);
    else byConference.set(conference, [group]);
  }

  // The West-first convention this app's audience actually expects; anything
  // that isn't literally a "West"/"East" conference (Wales, Campbell, ...)
  // just falls back to alphabetical.
  return [...byConference.entries()].sort(([a], [b]) => {
    const westA = /west/i.test(a);
    const westB = /west/i.test(b);
    if (westA !== westB) return westA ? -1 : 1;
    return a.localeCompare(b);
  });
}

/** Zero out a prior season's row so its numbers can't be mistaken for real results. */
function asUnplayed(row: StatRow): StatRow {
  return { ...row, gp: 0, w: 0, l: 0, t: null, otl: 0, pts: 0, ptPct: 0, clinch: null };
}

/** [1,2,3,4,5] -> [[1,2],[3,4],[5]] — two divisions per row, same shape as a conference section. */
function chunkPairs<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += 2) out.push(items.slice(i, i + 2));
  return out;
}

function DivisionTable({ division, teams, showCaption }: { division: string; teams: StatRow[]; showCaption: boolean }) {
  return (
    <div className="table-scroll">
      <table className="stat-table compact standings-table">
        {showCaption && <caption>{division}</caption>}
        <thead>
          <tr>
            <th scope="col">Team</th>
            {COLUMNS.map((col) => (
              <th key={col.key} scope="col">
                <span className="tip" tabIndex={0} aria-label={col.title}>
                  <abbr>{col.label}</abbr>
                  <span className="tip-bubble" role="tooltip">
                    {col.title}
                  </span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((row) => {
            const abbrev = typeof row.abbrev === 'string' ? row.abbrev : null;
            const logo = teamLogoUrl(abbrev);
            return (
              <tr key={row.id} className={clinchRowClass(row.clinch)}>
                <th scope="row">
                  <span className="team-cell">
                    {logo && (
                      <img
                        src={logo}
                        alt=""
                        className="team-logo"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                    {teamShortName(abbrev) || String(row.name ?? '—')}
                  </span>
                </th>
                <td>{fmtInt(row.gp)}</td>
                <td>{fmtInt(row.w)}</td>
                <td>{fmtInt(row.l)}</td>
                <td>{fmtInt(row.otl)}</td>
                <td className="is-best">{fmtInt(row.pts)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** A single season's final table, built from the same per-team season data the rest of the app compares. */
function SeasonStandings({ season, seasons }: { season: number; seasons: Manifest['seasons'] }) {
  const { data, loading, error } = useAsync(() => loadDataset('teams', season, 2), [season]);
  const notStarted = !loading && !error && (data?.length ?? 0) === 0;

  // Nothing has been played yet — fall back to last season's lineup, zeroed
  // out, so the section still shows who's in each division instead of a
  // dead end.
  const seasonIndex = seasons.findIndex((entry) => entry.id === season);
  const priorSeasonId = notStarted ? (seasons[seasonIndex + 1]?.id ?? null) : null;
  const prior = useAsync(
    () => (priorSeasonId !== null ? loadDataset('teams', priorSeasonId, 2) : Promise.resolve(null)),
    [priorSeasonId],
  );

  if (loading || (notStarted && priorSeasonId !== null && prior.loading)) {
    return <p className="muted">Loading standings…</p>;
  }
  if (error) return null;

  const rows = notStarted
    ? [...(prior.data ?? [])]
        .map(asUnplayed)
        .sort((a, b) => String(a.abbrev ?? '').localeCompare(String(b.abbrev ?? '')))
    : [...(data ?? [])].sort((a, b) => {
        const byPoints = (Number(b.pts) || 0) - (Number(a.pts) || 0);
        return byPoints !== 0 ? byPoints : (Number(b.ptPct) || 0) - (Number(a.ptPct) || 0);
      });

  if (rows.length === 0) {
    return <p className="muted">Standings appear once the season is under way.</p>;
  }

  const divisions = groupByDivision(rows);
  const conferences = groupByConference(divisions);
  const showCaption = divisions.length > 1;

  const hasTrophy = rows.some((row) => row.clinch === 'p');
  const hasPlayoffClinch = rows.some(
    (row) => typeof row.clinch === 'string' && CLINCH_CODES.has(row.clinch) && row.clinch !== 'p',
  );

  const seasonLabel = seasons[seasonIndex]?.label ?? 'This season';
  const showPlayoffLegend = notStarted || hasPlayoffClinch;
  const showTrophyLegend = notStarted || hasTrophy;
  const clinchGapNote = !notStarted && !showPlayoffLegend && !showTrophyLegend ? CLINCH_GAP_NOTES[season] : undefined;

  return (
    <>
      {conferences ? (
        conferences.map(([conference, groups]) => (
          <div key={conference} className="conference-section">
            <h3 className="conference-heading">{conference} Conference</h3>
            <div className="standings-grid">
              {groups.map(([division, teams]) => (
                <DivisionTable key={division} division={division} teams={teams} showCaption={showCaption} />
              ))}
            </div>
          </div>
        ))
      ) : (
        // No real conference to group by (a season without that concept at
        // all, like the geographic-only 2020-21 realignment) — still lay the
        // divisions out two-per-row, same shape as a conference section,
        // rather than however many fit across the page in one line.
        chunkPairs(divisions).map((pair, index) => (
          <div key={index} className="conference-section">
            <div className="standings-grid">
              {pair.map(([division, teams]) => (
                <DivisionTable key={division} division={division} teams={teams} showCaption={showCaption} />
              ))}
            </div>
          </div>
        ))
      )}
      {notStarted && (
        <p className="muted small standings-not-started">The {seasonLabel} season hasn’t started yet</p>
      )}
      {(showPlayoffLegend || showTrophyLegend) && (
        <p className="muted small standings-legend">
          {showPlayoffLegend && (
            <span className="legend-item">
              <span className="legend-swatch clinch-playoff" /> Clinched a playoff spot
            </span>
          )}
          {showTrophyLegend && (
            <span className="legend-item">
              <span className="legend-swatch clinch-trophy" /> Clinched President’s Trophy (best
              record in the league)
            </span>
          )}
        </p>
      )}
      {clinchGapNote && <p className="muted small standings-legend">{clinchGapNote}</p>}
    </>
  );
}

interface Props {
  manifest: Manifest | null;
}

/** Any season on record, grouped by division where the season had one — defaults to the newest season. */
export function Standings({ manifest }: Props) {
  const seasons = manifest?.seasons ?? [];
  const [season, setSeason] = useState<number | null>(null);
  const selected = season ?? manifest?.currentSeason ?? seasons[0]?.id ?? null;

  return (
    <>
      <label className="field standings-season">
        <span>Season</span>
        <select
          value={selected === null ? '' : String(selected)}
          onChange={(event) => setSeason(Number(event.target.value))}
        >
          {seasons.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.label}
            </option>
          ))}
        </select>
      </label>

      {selected !== null && <SeasonStandings season={selected} seasons={seasons} />}
    </>
  );
}
