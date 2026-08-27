import { useEffect, useMemo, useRef, useState } from 'react';

import { Controls } from './components/Controls';
import { EntityPicker } from './components/EntityPicker';
import { RadarCompare, type Series } from './components/RadarCompare';
import { Scoreboard } from './components/Scoreboard';
import { SelectionChips } from './components/SelectionChips';
import { Standings } from './components/Standings';
import { StatTable } from './components/StatTable';
import { ThemeToggle, useTheme } from './components/ThemeToggle';

import { loadDataset, loadFranchiseIndex, loadManifest, loadPlayerIndex } from './api/datasets';
import { useAsync } from './api/useDataset';
import { availableMetrics, radarMetrics, type Metric } from './lib/metrics';
import {
  buildDistributions,
  cohortRows,
  CAREER_MIN_GAMES,
  PLAYOFF_MIN_GAMES,
  type Distributions,
} from './lib/percentile';
import { fmtRelative } from './lib/format';
import { positionGroup, seriesColorForTheme, seriesColors } from './lib/teams';
import { effectiveSeason, MAX_PICKS, useCompareState, type CompareState } from './state/useCompareState';
import { formatSeasonId } from '../shared/seasons.mjs';
import type { Manifest, SeasonScope, StatRow } from './types';

/** A stable reference so an absent season never destabilises a memo just by being `[]`. */
const EMPTY_ROWS: StatRow[] = [];

const FALLBACK_DEFAULTS: CompareState = {
  kind: 'skaters',
  season: 20242025,
  gameType: 2,
  norm: 'pct',
  cohort: 'pos',
  picks: [],
};

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
  const theme = useTheme();

  const defaults = useMemo<CompareState>(
    () => ({ ...FALLBACK_DEFAULTS, season: newestPopulatedSeason(manifest) }),
    [manifest],
  );

  const { state, update, addPick, removePick, toggleFollow, shareUrl } = useCompareState(defaults);
  const indexState = useAsync(loadPlayerIndex, []);
  const franchiseState = useAsync(loadFranchiseIndex, []);

  // A pick with no row for its season (browsed outside a player's career, or
  // pinned somewhere they never played) still deserves a name on its chip —
  // "Connor McDavid" reads as "not this season", where "#8478402" reads as
  // "the app is broken". These indexes are all-time, season-independent, so
  // they can resolve a name even when the season-specific row cannot.
  const nameFor = useMemo(() => {
    const players = new Map((indexState.data ?? []).map((entry) => [entry.id, entry.name] as const));
    const teams = new Map((franchiseState.data?.rows ?? []).map((row) => [row.id, row.name] as const));
    return (id: number) => (state.kind === 'teams' ? teams.get(id) : players.get(id)) ?? `#${id}`;
  }, [indexState.data, franchiseState.data, state.kind]);

  // useCompareState only reads `defaults` once, on the very first render —
  // before the manifest has loaded, so a bare visit (no ?season= in the URL)
  // starts on FALLBACK_DEFAULTS.season and stays there even after the real
  // newest-populated season is known. Nudge it forward exactly once, and
  // only when the visitor did not explicitly choose a season themselves
  // (every link this app generates sets ?season=, so its absence means a
  // plain visit rather than a shared comparison being overridden).
  const [seasonSynced, setSeasonSynced] = useState(false);
  useEffect(() => {
    if (seasonSynced || !manifest) return;
    setSeasonSynced(true);
    if (new URLSearchParams(window.location.search).has('season')) return;
    if (defaults.season !== state.season) update({ season: defaults.season });
  }, [seasonSynced, manifest, defaults.season, state.season, update]);

  // Every season involved: the one being browsed, plus any season a pick was
  // pinned to. Loading them all is what makes cross-era comparison work. A
  // floating pick (season: null) resolves to the browsed season, which is
  // already in the set — it does not add a fetch of its own.
  const seasonKeys = useMemo(() => {
    const set = new Set<string>([String(state.season)]);
    for (const pick of state.picks) set.add(String(effectiveSeason(pick, state.season)));
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
  // Memoized (rather than a bare `?? []`) so a season that has not loaded yet
  // resolves to the *same* empty-array reference on every render instead of a
  // fresh one — otherwise every downstream memo that reads `pageRows` looks
  // "changed" on every render while loading, for no real reason. That churn
  // is what showed up as the radar chart flickering while browsing seasons.
  const pageRows = useMemo(
    () => datasets?.get(String(state.season)) ?? EMPTY_ROWS,
    [datasets, state.season],
  );

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
  const freshResult = useMemo(() => {
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

    const found: { row: StatRow; season: SeasonScope; following: boolean; pickIndex: number }[] = [];
    const absent: number[] = [];

    state.picks.forEach((pick, index) => {
      const season = effectiveSeason(pick, state.season);
      const rows = datasets.get(String(season)) ?? [];
      const row = rows.find((candidate) => candidate.id === pick.id);
      if (row) found.push({ row, season, following: pick.season === null, pickIndex: index });
      else absent.push(index);
    });

    const colors = seriesColors(
      found.map(({ row }) => (typeof row.teams === 'string' ? row.teams : String(row.abbrev ?? ''))),
    ).map((color) => seriesColorForTheme(color, theme));

    // The season suffix disambiguates a cross-era comparison ("Kucherov
    // 2017-18" vs. "Kucherov 2018-19"), so it only makes sense relative to
    // the *other* picks on the chart — not to whatever the Season selector
    // happens to be showing, which picking across eras naturally drifts from.
    const seasonsInPlay = new Set(found.map(({ season }) => String(season)));
    const showSeasonSuffix = seasonsInPlay.size > 1;

    const built: Series[] = found.map(({ row, season, following, pickIndex }, position) => {
      const group =
        state.cohort === 'all' || state.kind === 'teams'
          ? 'ALL'
          : positionGroup(typeof row.pos === 'string' ? row.pos : null);

      return {
        label: showSeasonSuffix
          ? `${row.name} (${season === 'career' ? 'career' : formatSeasonId(season)})`
          : String(row.name),
        color: colors[position] ?? '#4F9CF9',
        row,
        season,
        following,
        pickIndex,
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
    theme,
  ]);

  const busy = manifestState.loading || datasetsState.loading;

  // A floating pick's effective season changes the instant the Season
  // selector does, but its row for that season may still be in flight over
  // the network — `datasetsState.loading` does not flip to true until an
  // effect runs after this render commits, so it lags the season change by
  // one render and cannot be used to detect the gap. Comparing `seasonKeys`
  // against `datasets`'s actual keys is synchronous with no such lag: it
  // catches the exact render where a needed season has not arrived yet.
  // Recomputing `freshResult` in that gap would drop the pick to "missing"
  // for a frame and snap back once the fetch lands — the radar chart
  // blinking as picks vanish and reappear. Hold the last result that had at
  // least as much on it until every needed season is actually in hand.
  const needsFetch = !datasets || seasonKeys.some((key) => !datasets.has(key));
  const stableResultRef = useRef(freshResult);
  if (!needsFetch || freshResult.series.length >= stableResultRef.current.series.length) {
    stableResultRef.current = freshResult;
  }
  const { series, missing } = stableResultRef.current;

  if (manifestState.error) {
    return (
      <main className="shell">
        <header className="masthead">
          <h1>NHL Stats Comparison</h1>
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
          <h1>NHL Stats Comparison</h1>
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
          kind={state.kind}
          gameType={state.gameType}
          disabled={busy || state.picks.length >= MAX_PICKS}
          onPick={addPick}
        />
        <p className="muted small">
          {state.picks.length >= MAX_PICKS
            ? 'Four is the maximum — remove one to add another.'
            : `Add up to ${MAX_PICKS}. Each pick stays on its own season — toggle a chip to "live" to have it follow the browsed season instead.`}
        </p>
      </section>

      <SelectionChips
        chips={[
          ...series.map((entry) => ({
            label: entry.label,
            color: entry.color,
            season: entry.season,
            following: entry.following,
            pickIndex: entry.pickIndex,
          })),
          ...missing.map((index) => {
            const pick = state.picks[index];
            return {
              label: pick ? nameFor(pick.id) : 'Unknown',
              color: '#64748B',
              season: pick ? effectiveSeason(pick, state.season) : state.season,
              following: pick?.season === null,
              pickIndex: index,
              missing: true,
            };
          }),
        ]}
        onRemove={removePick}
        onToggleFollow={toggleFollow}
      />

      {datasetsState.error && (
        <div className="notice">
          <p>Could not load that season: {datasetsState.error.message}</p>
        </div>
      )}

      {!datasetsState.error && pageRows.length === 0 && datasets?.has(String(state.season)) && (
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
