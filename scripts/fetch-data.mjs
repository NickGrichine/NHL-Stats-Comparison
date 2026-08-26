#!/usr/bin/env node
/**
 * Build the static dataset the site runs on.
 *
 * The NHL API does not send CORS headers, so the browser can never call it
 * directly. This script runs in GitHub Actions instead, where there is no
 * browser and therefore no CORS, and writes plain JSON that the site fetches
 * same-origin.
 *
 *   node scripts/fetch-data.mjs              # incremental (default)
 *   node scripts/fetch-data.mjs --live-only  # just scoreboard + standings
 *   node scripts/fetch-data.mjs --force      # refetch everything
 *   node scripts/fetch-data.mjs --seasons=20242025,20232024
 *
 * Incremental is the normal mode: a finished season can never change, so it is
 * fetched exactly once in the project's lifetime and skipped forever after.
 * Only the current and previous seasons are refetched.
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { fetchJson, fetchReport, pooled, STATS_BASE, WEB_BASE } from './nhl-client.mjs';
import { ENTITIES, mergeReports, cayenne } from './endpoints.mjs';
import { encodeColumnar } from '../shared/codec.mjs';
import { GAME_TYPE, formatSeasonId, mutableSeasonIds, currentSeasonId } from '../shared/seasons.mjs';

const SCHEMA_VERSION = 1;
const GAME_TYPES = [GAME_TYPE.REGULAR, GAME_TYPE.PLAYOFFS];
const ENTITY_KINDS = /** @type {const} */ (['skaters', 'goalies', 'teams']);

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2);
const hasFlag = (name) => argv.includes(`--${name}`);
const flagValue = (name) => {
  const match = argv.find((arg) => arg.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : null;
};

const options = {
  liveOnly: hasFlag('live-only'),
  force: hasFlag('force'),
  seasons: flagValue('seasons')
    ?.split(',')
    .map((s) => Number(s.trim()))
    .filter(Boolean),
  // CI writes to ./data (the `data` branch checkout); local development can
  // point straight at public/data so `npm run dev` picks it up with no symlink.
  out: flagValue('out') ?? 'data',
};

const OUT_DIR = path.resolve(process.cwd(), options.out);

// ------------------------------------------------------------------ helpers

const log = (...args) => console.log(...args);

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function writeJson(relativePath, value) {
  const target = path.join(OUT_DIR, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, JSON.stringify(value), 'utf8');
  return target;
}

async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(path.join(OUT_DIR, relativePath), 'utf8'));
  } catch {
    return null;
  }
}

const seasonFile = (seasonId, kind, gameType) =>
  `season/${seasonId}/${kind}-${gameType}.json`;

// -------------------------------------------------------------------- steps

/** Every season the API knows about, newest first. */
async function loadSeasons() {
  const payload = await fetchJson(`${STATS_BASE}/season`, { label: 'season list' });
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  return rows
    .map((row) => ({
      id: Number(row.id),
      label: formatSeasonId(row.id),
      games: Number(row.totalRegularSeasonGames) || null,
      perTeam: Number(row.numberOfGames) || null,
      playoffGames: Number(row.totalPlayoffGames) || null,
      ties: Boolean(row.tiesInUse),
    }))
    .filter((season) => Number.isFinite(season.id))
    .sort((a, b) => b.id - a.id);
}

/** teamId -> triCode, so team rows can carry an abbreviation and a logo. */
async function loadTeamLookup() {
  const payload = await fetchJson(`${STATS_BASE}/team`, { label: 'team list' });
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  /** @type {Record<number, string>} */
  const lookup = {};
  for (const row of rows) {
    const id = Number(row.id);
    const code = row.triCode ?? row.rawTricode;
    if (Number.isFinite(id) && code) lookup[id] = String(code);
  }
  return lookup;
}

/**
 * Fetch, merge, normalise and write one (season, kind, gameType) slice.
 * Returns the row count, or null when the API had nothing for that slice.
 */
async function buildSlice(seasonId, kind, gameType, context) {
  const entity = ENTITIES[kind];
  const filter = cayenne({ seasonId, gameType });

  const applicable = entity.reports.filter(
    (report) => !report.since || seasonId >= report.since,
  );

  const results = await pooled(
    applicable.map((report) => async () => {
      try {
        const { data } = await fetchReport(report.name, { cayenneExp: filter });
        return data;
      } catch (error) {
        if (report.required) throw error;
        // A supplementary report going missing for an odd season is expected;
        // the summary row still carries everything the radar needs.
        console.warn(`  optional report ${report.name} unavailable: ${error.message}`);
        return [];
      }
    }),
    2,
  );

  const merged = mergeReports(entity.key, results);
  if (merged.length === 0) return null;

  const rows = merged.map((row) => {
    const record = entity.normalise(row);
    if (kind === 'teams' && record.id !== null) {
      record.abbrev = context.teamLookup[record.id] ?? null;
    }
    return record;
  });

  const payload = encodeColumnar(rows, {
    fields: entity.fields,
    meta: { kind, seasonId, gameType, schema: SCHEMA_VERSION },
  });

  await writeJson(seasonFile(seasonId, kind, gameType), payload);
  return rows.length;
}

/**
 * Career totals: one aggregated row per player across every season.
 *
 * `isAggregate=true` with only a game-type filter groups by player, which
 * turns what would be ~9000 individual requests into one. The row count is
 * sanity-checked before anything is written, because a silent change in that
 * grouping behaviour would otherwise produce a plausible-looking but wrong file.
 */
async function buildCareer(kind, gameType) {
  const entity = ENTITIES[kind];
  const { data } = await fetchReport(entity.reports[0].name, {
    cayenneExp: cayenne({ gameType }),
    isAggregate: true,
  });

  if (data.length < 100) {
    console.warn(
      `  career ${kind}/${gameType}: only ${data.length} rows — refusing to write a ` +
        'file that looks like the aggregate collapsed to a single row.',
    );
    return null;
  }

  const rows = data.map((row) => entity.normalise(row));
  const payload = encodeColumnar(rows, {
    fields: entity.fields,
    meta: { kind, seasonId: 'career', gameType, schema: SCHEMA_VERSION },
  });

  await writeJson(`career/${kind}-${gameType}.json`, payload);
  return rows.length;
}

/**
 * The all-time search index: every player who ever appeared, with the seasons
 * they played. This is what powers the picker, so it has to be small enough to
 * load up front — id, name, position and a season range, nothing else.
 */
async function buildPlayerIndex(seasons) {
  /** @type {Map<number, { id: number, name: string, pos: string|null, kind: string, first: number, last: number, teams: Set<string> }>} */
  const players = new Map();

  for (const season of seasons) {
    for (const kind of ['skaters', 'goalies']) {
      for (const gameType of GAME_TYPES) {
        const payload = await readJson(seasonFile(season.id, kind, gameType));
        if (!payload) continue;

        const fields = payload.f ?? [];
        const idIndex = fields.indexOf('id');
        const nameIndex = fields.indexOf('name');
        const posIndex = fields.indexOf('pos');
        const teamsIndex = fields.indexOf('teams');
        if (idIndex === -1 || nameIndex === -1) continue;

        for (const values of payload.r ?? []) {
          const id = values[idIndex];
          const name = values[nameIndex];
          if (typeof id !== 'number' || typeof name !== 'string') continue;

          let entry = players.get(id);
          if (!entry) {
            entry = {
              id,
              name,
              pos: posIndex === -1 ? 'G' : (values[posIndex] ?? null),
              kind,
              first: season.id,
              last: season.id,
              teams: new Set(),
            };
            players.set(id, entry);
          }

          entry.first = Math.min(entry.first, season.id);
          entry.last = Math.max(entry.last, season.id);
          const teams = teamsIndex === -1 ? null : values[teamsIndex];
          if (typeof teams === 'string') {
            for (const code of teams.split(',')) {
              const trimmed = code.trim();
              if (trimmed) entry.teams.add(trimmed);
            }
          }
        }
      }
    }
  }

  const rows = [...players.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      pos: entry.pos,
      kind: entry.kind,
      first: entry.first,
      last: entry.last,
      teams: [...entry.teams].join(','),
    }));

  await writeJson(
    'index/players.json',
    encodeColumnar(rows, {
      fields: ['id', 'name', 'pos', 'kind', 'first', 'last', 'teams'],
      meta: { kind: 'playerIndex', schema: SCHEMA_VERSION },
    }),
  );

  return rows.length;
}

/** Franchise list, including defunct clubs, for the team picker. */
async function buildFranchiseIndex(teamLookup) {
  const payload = await fetchJson(`${STATS_BASE}/franchise`, { label: 'franchise list' });
  const rows = (Array.isArray(payload?.data) ? payload.data : []).map((row) => ({
    id: Number(row.id),
    name: String(row.fullName ?? ''),
    common: row.teamCommonName ?? null,
    place: row.teamPlaceName ?? null,
  }));

  await writeJson('index/franchises.json', { schema: SCHEMA_VERSION, rows, teamLookup });
  return rows.length;
}

/** Write the manifest. Called periodically so progress survives a crash. */
async function saveManifest(seasons, counts) {
  await writeJson('manifest.json', {
    schema: SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    liveFetchedAt: new Date().toISOString(),
    currentSeason: currentSeasonId(),
    seasons: seasons.map(({ id, label, games, perTeam, playoffGames, ties }) => ({
      id,
      label,
      games,
      perTeam,
      playoffGames,
      ties,
    })),
    counts,
  });
}

/** Today's games and the live standings. Cheap, so refreshed on every run. */
async function buildLive() {
  const results = {};

  for (const [name, url] of [
    ['scoreboard', `${WEB_BASE}/score/now`],
    ['standings', `${WEB_BASE}/standings/now`],
  ]) {
    try {
      const payload = await fetchJson(url, { label: name, attempts: 3 });
      await writeJson(`live/${name}.json`, { fetchedAt: new Date().toISOString(), payload });
      results[name] = 'ok';
    } catch (error) {
      // A failed live fetch must never fail the build — the comparison tool,
      // which is the point of the site, does not depend on it.
      console.warn(`  live ${name} failed: ${error.message}`);
      results[name] = 'failed';
    }
  }

  return results;
}

// --------------------------------------------------------------------- main

async function main() {
  const startedAt = Date.now();
  await mkdir(OUT_DIR, { recursive: true });

  log('Refreshing live files…');
  const live = await buildLive();
  log(`  scoreboard: ${live.scoreboard}, standings: ${live.standings}`);

  if (options.liveOnly) {
    const manifest = (await readJson('manifest.json')) ?? {};
    manifest.liveFetchedAt = new Date().toISOString();
    await writeJson('manifest.json', manifest);
    log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s (live only).`);
    return;
  }

  const previous = await readJson('manifest.json');
  const seasons = await loadSeasons();
  const teamLookup = await loadTeamLookup();
  log(`${seasons.length} seasons known, ${formatSeasonId(seasons[0]?.id)} back to ${formatSeasonId(seasons.at(-1)?.id)}.`);

  const mutable = new Set(mutableSeasonIds());
  /** @type {Record<string, Record<string, number>>} */
  const counts = previous?.counts ? { ...previous.counts } : {};

  // Work out what actually needs fetching before touching the network.
  const work = [];
  for (const season of seasons) {
    if (options.seasons && !options.seasons.includes(season.id)) continue;

    for (const kind of ENTITY_KINDS) {
      for (const gameType of GAME_TYPES) {
        const file = seasonFile(season.id, kind, gameType);
        const onDisk = await exists(path.join(OUT_DIR, file));
        const known = counts[season.id]?.[`${kind}-${gameType}`];

        // Skip a slice we already know is empty (no playoffs that year, no
        // goalie report that far back) so we do not re-ask every single run.
        const knownEmpty = known === 0 && !options.force;
        const needsFetch =
          options.force ||
          options.seasons?.includes(season.id) ||
          mutable.has(season.id) ||
          (!onDisk && !knownEmpty);

        if (needsFetch) work.push({ season, kind, gameType });
      }
    }
  }

  log(`${work.length} slices to fetch.`);

  const changed = work.length > 0;
  const failed = [];
  let index = 0;

  for (const item of work) {
    index += 1;
    const tag = `${formatSeasonId(item.season.id)} ${item.kind} gt${item.gameType}`;
    try {
      const rows = await buildSlice(item.season.id, item.kind, item.gameType, { teamLookup });
      counts[item.season.id] ??= {};
      counts[item.season.id][`${item.kind}-${item.gameType}`] = rows ?? 0;
      log(`  [${index}/${work.length}] ${tag}: ${rows ?? 0} rows`);
    } catch (error) {
      // One bad slice must not throw away 600 good ones. Record it, carry on,
      // and fail loudly at the end — the next run picks up exactly what is
      // still missing, because the work set is computed from what is on disk.
      console.error(`  [${index}/${work.length}] ${tag}: FAILED — ${error.message}`);
      failed.push({ tag, message: error.message });
    }

    // Checkpoint, so a crash costs one slice rather than the whole run's
    // bookkeeping — including the "known empty" markers that stop us
    // re-asking about seasons that have no playoffs.
    if (index % 25 === 0) await saveManifest(seasons, counts);
  }

  if (changed || !(await exists(path.join(OUT_DIR, 'index/players.json')))) {
    log('Rebuilding indexes…');
    const players = await buildPlayerIndex(seasons);
    const franchises = await buildFranchiseIndex(teamLookup);
    log(`  ${players} players, ${franchises} franchises`);

    log('Rebuilding career aggregates…');
    for (const kind of ['skaters', 'goalies']) {
      for (const gameType of GAME_TYPES) {
        const rows = await buildCareer(kind, gameType);
        log(`  career ${kind} gt${gameType}: ${rows ?? 'skipped'}`);
      }
    }
  }

  await saveManifest(seasons, counts);

  log(`Done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);

  if (failed.length > 0) {
    console.error(`\n${failed.length} of ${work.length} slice(s) failed:`);
    for (const { tag, message } of failed) console.error(`  ${tag} — ${message}`);

    // A handful of failures out of hundreds is not worth blocking a deploy
    // over: the work set is derived from what is on disk, so the next run
    // retries exactly the gaps and nothing else. Fail the build only when
    // enough went wrong that the dataset should not be trusted.
    const rate = failed.length / Math.max(work.length, 1);
    if (rate > 0.02) {
      console.error(`\n${(rate * 100).toFixed(1)}% failed — failing the build.`);
      process.exitCode = 1;
    } else {
      console.warn('\nBelow the 2% threshold; the next run will pick these up.');
    }
  }
}

main().catch((error) => {
  console.error('\nfetch-data failed:', error);
  process.exitCode = 1;
});
