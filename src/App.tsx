import { useMemo } from 'react';

import { Controls } from './components/Controls';
import { EntityPicker } from './components/EntityPicker';
import { RadarCompare, type Series } from './components/RadarCompare';
import { Scoreboard } from './components/Scoreboard';
import { SelectionChips } from './components/SelectionChips';
import { Standings } from './components/Standings';
import { StatTable } from './components/StatTable';
import { ThemeToggle } from './components/ThemeToggle';

import { loadDataset, loadManifest, loadPlayerIndex } from './api/datasets';
import { useAsync } from './api/useDataset';
import { availableMetrics, radarMetrics, type Metric } from './lib/metrics';
import { buildDistributions, cohortRows, type Distributions } from './lib/percentile';
import { fmtRelative } from './lib/format';
import { positionGroup, seriesColors } from './lib/teams';
import { MAX_PICKS, useCompareState, type CompareState } from './state/useCompareState';
import { formatSeasonId } from '../shared/seasons.mjs';
import type { Manifest, SeasonScope, StatRow } from './types';

const FALLBACK_DEFAULTS: CompareState = {
  kind: 'skaters',
  season: 20242025,
  gameType: 2,
  norm: 'pct',
  cohort: 'pos',
  picks: [],
};

/** A career has to be long enough to be a career before it joins the cohort. */
const CAREER_MIN_GAMES = 100;
/** Playoff runs are short by nature, so the qualifying line is flat and low. */
const PLAYOFF_MIN_GAMES = 3;

/**
 * The newest season that actually has data.
 *
 * In August the "current" season has not been played yet, so defaulting to it
 * would open the app on an empty chart. The manifest's row counts are the
 * honest answer to "what is the newest season worth showing".
 */
function newestPopulatedSeason(manifest: Manifest | null): SeasonScope {
  if (!manifest) return FALLBACK_DEFAULTS.season;
  const populated = manifest.seasons
    .filter((season) => (manifest.counts[String(season.id)]?.['skaters-2'] ?? 0) > 0)
    .map((season) => season.id);
  return populated.length > 0 ? Math.max(...populated) : FALLBACK_DEFAULTS.season;
}

export default function App() {
  const manifestState = useAsync(loadManifest, []);
  const manifest = manifestState.data;

  const defaults = useMemo<CompareState>(
    () => ({ ...FALLBACK_DEFAULTS, season: newestPopulatedSeason(manifest) }),
    [manifest],
  );

  const { state, update, addPick, removePick, shareUrl } = useCompareState(defaults);
  const indexState = useAsync(loadPlayerIndex, []);

  // Every season involved: the one being browsed, plus any season a pick was
  // pinned to. Loading them all is what makes cross-era comparison work.
  const seasonKeys = useMemo(() => {
    const set = new Set<string>([String(state.season)]);
    for (const pick of state.picks) set.add(String(pick.season));
    return [...set];
  }, [state.season, state.picks]);

  const datasetsState = useAsync(async () => {
    const entries = await Promise.all(
      seasonKeys.map(async (key) => {
        const season: SeasonScope = key === 'career' ? 'career' : Number(key);
        const rows = await loadDataset(state.kind, season, state.gameType);
        return [key, rows] as const;
      }),
    );
    return new Map(entries);
  }, [state.kind, state.gameType, seasonKeys.join('|')]);

  const datasets = datasetsState.data;
  const pageRows = datasets?.get(String(state.season)) ?? [];

  /**
   * Metrics common to every dataset on screen.
   *
   * Comparing 2024-25 to 1985-86 means dropping hits and blocked shots, because
   * the league did not record them in 1985. Intersecting is the honest move —
   * the alternative is an axis where one player scores zero for a stat nobody
   * was counting.
   */
  const metrics = useMemo<{ radar: Metric[]; table: Metric[] }>(() => {
    if (!datasets || datasets.size === 0) return { radar: [], table: [] };

    const perSeason = [...datasets.values()].map((rows) => availableMetrics(state.kind, rows));
    const shared = perSeason.reduce<Metric[]>((accumulator, list, position) => {
      if (position === 0) return list;
      const keys = new Set(list.map((metric) => metric.key));
      return accumulator.filter((metric) => keys.has(metric.key));
    }, []);

    const sharedKeys = new Set(shared.map((metric) => metric.key));
    const radar = radarMetrics(state.kind, pageRows).filter((metric) => sharedKeys.has(metric.key));

    return { radar: radar.length >= 3 ? radar : shared.slice(0, 8), table: shared };
  }, [datasets, state.kind, pageRows]);

  /**
   * Resolve each pick to a row and to the population it should be ranked
   * against — its own season, its own position group.
   *
   * A centre is compared to forwards, a defenceman to defencemen. Ranking a
   * blueliner's point total against a first-line winger's is exactly the false
   * equivalence the old fixed-cap normalisation produced.
   */
  const { series, missing } = useMemo(() => {
    if (!datasets) return { series: [] as Series[], missing: [] as number[] };

    const keys = metrics.table.map((metric) => metric.key);
    const cache = new Map<string, Distributions>();

    const distributionsFor = (season: SeasonScope, group: 'F' | 'D' | 'G' | 'ALL') => {
      const cacheKey = `${season}|${group}`;
      const hit = cache.get(cacheKey);
      if (hit) return hit;

      const rows = datasets.get(String(season)) ?? [];
      const seasonMeta = manifest?.seasons.find((entry) => entry.id === season);

      const minGames =
        season === 'career'
          ? CAREER_MIN_GAMES
          : state.gameType === 3
            ? PLAYOFF_MIN_GAMES
            : undefined;

      const built = buildDistributions(
        cohortRows(rows, {
          gamesInSeason: seasonMeta?.perTeam ?? null,
          group,
          ...(minGames === undefined ? {} : { minGames }),
        }),
        keys,
      );

      cache.set(cacheKey, built);
      return built;
    };

    const found: { row: StatRow; season: SeasonScope }[] = [];
    const absent: number[] = [];

    state.picks.forEach((pick, index) => {
      const rows = datasets.get(String(pick.season)) ?? [];
      const row = rows.find((candidate) => candidate.id === pick.id);
      if (row) found.push({ row, season: pick.season });
      else absent.push(index);
    });

    const colors = seriesColors(
      found.map(({ row }) => (typeof row.teams === 'string' ? row.teams : String(row.abbrev ?? ''))),
    );

    const built: Series[] = found.map(({ row, season }, position) => {
      const group =
        state.cohort === 'all' || state.kind === 'teams'
          ? 'ALL'
          : positionGroup(typeof row.pos === 'string' ? row.pos : null);

      return {
        label:
          season === state.season
            ? String(row.name)
            : `${row.name} (${season === 'career' ? 'career' : formatSeasonId(season)})`,
        color: colors[position] ?? '#4F9CF9',
        row,
        distributions: distributionsFor(season, group),
      };
    });

    return { series: built, missing: absent };
  }, [
    datasets,
    state.picks,
    state.season,
    state.cohort,
    state.kind,
    state.gameType,
    metrics.table,
    manifest,
  ]);

  const busy = manifestState.loading || datasetsState.loading;

  if (manifestState.error) {
    return (
      <main className="shell">
        <header className="masthead">
          <h1>NHL Comparison</h1>
        </header>
        <div className="notice">
          <h2>No data published yet</h2>
          <p>
            The dataset is built by the <code>Update data and deploy</code> GitHub Actions
            workflow. Run it once (Actions → Update data and deploy → Run workflow) and this
            page will fill itself in.
          </p>
          <p className="muted small">{manifestState.error.message}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <header className="masthead">
        <div>
          <h1>NHL Comparison</h1>
          <p className="tagline">
            Every skater, goalie and team since 1917-18, compared on an era-adjusted scale.
          </p>
        </div>
        <div className="masthead-actions">
          {manifest && (
            <p className="freshness" title={manifest.generatedAt}>
              <span className="live-dot" aria-hidden="true" />
              Data refreshed {fmtRelative(manifest.generatedAt)}
            </p>
          )}
          <ThemeToggle />
        </div>
      </header>

      <Controls state={state} manifest={manifest} shareUrl={shareUrl} onChange={update} />

      <section className="picker-row" aria-label="Choose what to compare">
        <EntityPicker
          rows={pageRows}
          index={indexState.data ?? []}
          season={state.season}
          kind={state.kind}
          disabled={busy || state.picks.length >= MAX_PICKS}
          onPick={addPick}
        />
        <p className="muted small">
          {state.picks.length >= MAX_PICKS
            ? 'Four is the maximum — remove one to add another.'
            : `Add up to ${MAX_PICKS}. Change the season and add again to compare across eras.`}
        </p>
      </section>

      <SelectionChips
        chips={[
          ...series.map((entry, index) => ({
            label: entry.label,
            color: entry.color,
            season: state.picks[index]?.season ?? state.season,
          })),
          ...missing.map((index) => ({
            label: `#${state.picks[index]?.id}`,
            color: '#64748B',
            season: state.picks[index]?.season ?? state.season,
            missing: true,
          })),
        ]}
        pageSeason={state.season}
        onRemove={removePick}
      />

      {datasetsState.error && (
        <div className="notice">
          <p>Could not load that season: {datasetsState.error.message}</p>
        </div>
      )}

      {!datasetsState.error && pageRows.length === 0 && !busy && (
        <div className="notice">
          <p>
            No {state.kind} recorded for{' '}
            {state.season === 'career' ? 'career totals' : formatSeasonId(state.season)}{' '}
            {state.gameType === 3 ? 'in the playoffs' : 'in the regular season'}.
          </p>
        </div>
      )}

      <section className="compare">
        <div className="panel">
          <h2>Radar</h2>
          <RadarCompare series={series} metrics={metrics.radar} norm={state.norm} />
        </div>

        <div className="panel">
          <h2>Statistics</h2>
          <StatTable series={series} metrics={metrics.table} kind={state.kind} />
        </div>
      </section>

      <section className="panel">
        <h2>Today</h2>
        <Scoreboard />
      </section>

      <section className="panel">
        <h2>Standings</h2>
        <Standings />
      </section>

      <footer className="footer">
        <p>
          Data from the NHL's public stats API, refreshed automatically by GitHub Actions. Not
          affiliated with or endorsed by the National Hockey League.
        </p>
        <p>
          <a href="https://github.com/NickGrichine/NHL-Stats-Comparison">Source on GitHub</a>
        </p>
      </footer>
    </main>
  );
}
