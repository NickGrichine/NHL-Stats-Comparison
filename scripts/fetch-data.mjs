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
import { svgPathBbox } from 'svg-path-bbox';

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

/**
 * The date each season's standings became final (or, lacking that, when they
 * started) — the NHL's own standings-by-date endpoint is the one source that
 * gets a season's real division/conference structure *and* every team's
 * logo exactly as it looked that year right for free, historical
 * realignments and rebrands included.
 */
async function loadStandingsSeasonMeta() {
  const payload = await fetchJson(`${WEB_BASE}/standings-season`, {
    label: 'standings season list',
  });
  const rows = Array.isArray(payload?.seasons) ? payload.seasons : [];
  /** @type {Map<number, { standingsStart: string|null, standingsEnd: string|null }>} */
  const map = new Map();
  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isFinite(id)) continue;
    map.set(id, {
      standingsStart: row.standingsStart ?? null,
      standingsEnd: row.standingsEnd ?? null,
    });
  }
  return map;
}

const logoBoxCache = new Map();

/**
 * The union bounding box, in the logo's own 960x640 viewBox units, of every
 * `<path>` this SVG draws — the frontend uses it to zoom each crest in by
 * exactly the amount *it* needs, since the CDN's fixed canvas size means a
 * plain, tightly-drawn 1930s mark and a modern circular badge with a lot of
 * padding around it end up the same declared size but very different actual
 * sizes. Cached by URL for the run: the same era's logo is shared across
 * every season that used it, so this fetches and parses each one once.
 *
 * A regex pull of `d="..."` attributes rather than a real XML/SVG parse —
 * every logo on this CDN turns out to be flat `<path>` elements with no
 * groups or transforms, so it's an exact bounding box in practice, not an
 * approximation, without pulling in an SVG/DOM dependency for it.
 */
async function getLogoBox(url) {
  if (!url) return null;
  if (logoBoxCache.has(url)) return logoBoxCache.get(url);

  let box = null;
  try {
    const response = await fetch(url);
    if (response.ok) {
      const text = await response.text();
      const paths = [...text.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
      let union = null;
      for (const d of paths) {
        const b = svgPathBbox(d);
        if (!b.every((n) => Number.isFinite(n))) continue;
        union = union
          ? [Math.min(union[0], b[0]), Math.min(union[1], b[1]), Math.max(union[2], b[2]), Math.max(union[3], b[3])]
          : b;
      }
      if (union) box = union.map((n) => Math.round(n * 10) / 10).join(',');
    }
  } catch (error) {
    console.warn(`  logo bbox for ${url} failed: ${error.message}`);
  }

  logoBoxCache.set(url, box);
  return box;
}

const divisionMapCache = new Map();

/**
 * That season's division/conference, clinch status, and — the reason this
 * isn't gated on whether the season even had divisions — every team's logo
 * exactly as it looked that year. The NHL's asset CDN only hosts a team's
 * *current* crest under its bare tricode, but the standings-by-date payload
 * gives each team a `teamLogo` URL scoped to the exact era that design was
 * used (e.g. `MMR_19251926-19341935`), which is what lets a fully defunct
 * club like the Montreal Maroons still get its own real logo instead of a
 * modern stand-in or a plain monogram.
 *
 * Returned as two maps, keyed by abbreviation and by full team name: this
 * endpoint's own abbreviation isn't always the one the rest of the pipeline
 * uses for the same franchise — 1977-78's Cleveland Barons show up here as
 * "CBN" while everywhere else (including this same payload's own logo URL)
 * calls them "CLE" — so `buildSlice` tries abbreviation first and falls back
 * to the team's full name, rather than that one team silently losing its
 * division for the season and corrupting the whole conference layout.
 *
 * A finished season is fetched once from its final standings date and cached
 * forever — that snapshot can never change. A season that has started but not
 * finished (the current one, refetched every run regardless of cache) instead
 * reads `/standings/now`, so division alignment and clinches — Presidents'
 * Trophy, division, conference, wild card — appear and firm up live as the
 * season actually plays out, rather than waiting for it to be over. A season
 * that has not started yet returns null, which the frontend borrows the
 * prior season's row for instead.
 *
 * `divisionSequence`/`conferenceSequence` in the raw payload are each team's
 * *rank within* that group, not the group's own order — useless for sorting
 * divisions, which is why they are not captured here.
 */
async function getDivisionMap(seasonId, standingsMeta) {
  if (divisionMapCache.has(seasonId)) return divisionMapCache.get(seasonId);

  const info = standingsMeta.get(seasonId);
  let result = null;

  if (info) {
    const endTime = info.standingsEnd ? Date.parse(info.standingsEnd) : NaN;
    const startTime = info.standingsStart ? Date.parse(info.standingsStart) : NaN;
    const finished = Number.isFinite(endTime) && endTime <= Date.now();
    const started = Number.isFinite(startTime) && startTime <= Date.now();

    if (finished || started) {
      const url = finished ? `${WEB_BASE}/standings/${info.standingsEnd}` : `${WEB_BASE}/standings/now`;
      try {
        const payload = await fetchJson(url, { label: `standings groups ${seasonId}` });
        const rows = Array.isArray(payload?.standings) ? payload.standings : [];
        const byAbbrev = new Map();
        const byName = new Map();
        for (const row of rows) {
          const abbrev = row.teamAbbrev?.default;
          const name = row.teamName?.default;
          const entry = {
            division: row.divisionName ?? null,
            conference: row.conferenceName ?? null,
            clinch: row.clinchIndicator ?? null,
            logo: row.teamLogo ?? null,
            logoBox: await getLogoBox(row.teamLogo),
          };
          if (abbrev) byAbbrev.set(abbrev, entry);
          if (name) byName.set(name, entry);
        }
        result = { byAbbrev, byName };
      } catch (error) {
        console.warn(`  division lookup for ${seasonId} failed: ${error.message}`);
        result = null;
      }
    }
  }

  divisionMapCache.set(seasonId, result);
  return result;
}

const bracketCache = new Map();

/**
 * That season's playoff bracket series, from the NHL's `playoff-bracket/{year}`
 * (the year is the season's end year: 20232024 -> 2024). Cached for the run
 * since both the champion flag and the Final panel read from it. A season
 * with no playoffs yet — or a failed fetch — is an empty list.
 */
async function getBracket(seasonId) {
  if (bracketCache.has(seasonId)) return bracketCache.get(seasonId);

  let series = [];
  try {
    const payload = await fetchJson(`${WEB_BASE}/playoff-bracket/${seasonId % 10000}`, {
      label: `playoff bracket ${seasonId}`,
    });
    series = Array.isArray(payload?.series) ? payload.series : [];
  } catch (error) {
    console.warn(`  playoff bracket for ${seasonId} failed: ${error.message}`);
  }

  bracketCache.set(seasonId, series);
  return series;
}

/**
 * That season's Stanley Cup Final winner, resolved from the playoff bracket
 * rather than derived from the regular-season standings lookup — a team that
 * goes on to win the Cup is identified by whoever actually won the Final
 * series, independent of how (or whether) the standings/logo data names it.
 * A season with no decided Final — not started, still in progress, or
 * cancelled — returns null.
 */
async function getStanleyCupChampion(seasonId) {
  const series = await getBracket(seasonId);
  const final = series.find((s) => /stanley cup final/i.test(s.seriesTitle ?? ''));
  if (!final?.winningTeamId) return null;

  const winner =
    final.topSeedTeam?.id === final.winningTeamId
      ? final.topSeedTeam
      : final.bottomSeedTeam?.id === final.winningTeamId
        ? final.bottomSeedTeam
        : null;
  return winner ? { abbrev: winner.abbrev ?? null, name: winner.name?.default ?? null } : null;
}

/**
 * Which league a bracket team's crest belongs to, read off its logo path
 * (`/logos/nhl/`, `/logos/pcha/`, `/logos/wchl/`). The NHL only carried the
 * Stanley Cup alone until 1926 — the PCHA and WCHL champions contested it
 * too, but their regular seasons are not in this API at all, so the Cup
 * series are the only place those clubs appear. null means an NHL club.
 */
function leagueOf(logo) {
  const match = /\/logos\/([a-z]+)\//i.exec(logo ?? '');
  return match && match[1].toLowerCase() !== 'nhl' ? match[1].toUpperCase() : null;
}

async function describeBracketTeam(team, wins) {
  return {
    id: team.id ?? null,
    abbrev: team.abbrev ?? null,
    name: team.name?.default ?? null,
    league: leagueOf(team.logo),
    wins: Number.isFinite(Number(wins)) ? Number(wins) : null,
    logo: team.logo ?? null,
    logoBox: await getLogoBox(team.logo),
  };
}

/**
 * `season/{id}/cup.json`: the Stanley Cup Final — and only the Final, so every
 * season reads the same way. (The bracket also carries earlier Cup-titled
 * rounds — "Stanley Cup Qualifiers", "Semifinals" — and, in the early years,
 * an "NHL Final"; none of those belong here.) Written once per season; a
 * season with no decided-or-underway Final (no playoffs yet, the 2004-05
 * lockout) writes nothing and the frontend treats a missing file as "none".
 */
async function buildCupFile(seasonId) {
  const series = await getBracket(seasonId);
  const wanted = series
    .filter((s) => /^stanley cup final$/i.test((s.seriesTitle ?? '').trim()))
    .filter((s) => s.topSeedTeam?.name?.default && s.bottomSeedTeam?.name?.default);
  if (wanted.length === 0) return false;

  const out = [];
  for (const s of wanted) {
    out.push({
      title: s.seriesTitle,
      round: s.playoffRound ?? null,
      top: await describeBracketTeam(s.topSeedTeam, s.topSeedWins),
      bottom: await describeBracketTeam(s.bottomSeedTeam, s.bottomSeedWins),
      winnerId: s.winningTeamId ?? null,
    });
  }

  await writeJson(`season/${seasonId}/cup.json`, { schema: SCHEMA_VERSION, seasonId, series: out });
  return true;
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
      // Abbreviation first, full name second — see `getDivisionMap` for why
      // a team can be missing under its own tricode (Cleveland Barons/"CBN").
      const info =
        (record.abbrev ? context.divisionMap?.byAbbrev.get(record.abbrev) : null) ??
        (typeof record.name === 'string' ? context.divisionMap?.byName.get(record.name) : null) ??
        null;
      record.division = info?.division ?? null;
      record.conference = info?.conference ?? null;
      record.clinch = info?.clinch ?? null;
      record.logo = info?.logo ?? null;
      record.logoBox = info?.logoBox ?? null;
      const champion = context.cupChampion;
      record.cupChampion = Boolean(
        champion &&
          ((record.abbrev && champion.abbrev && record.abbrev === champion.abbrev) ||
            (typeof record.name === 'string' && champion.name && record.name === champion.name)),
      );
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

/** The NHL's game days are Eastern-time calendar dates, whatever zone the runner is in. */
const etDate = (date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(date);

const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const gameCount = (day) => day.numberOfGames ?? day.games?.length ?? 0;
const fetchWeek = (date) => fetchJson(`${WEB_BASE}/schedule/${date}`, { label: `schedule ${date}`, attempts: 3 });

/** First date after `today` with games, following the schedule's own week-to-week links. */
async function nextGameDate(today) {
  let week = await fetchWeek(today);
  for (let hop = 0; hop < 6 && week; hop += 1) {
    const day = (week.gameWeek ?? []).find((d) => d.date > today && gameCount(d) > 0);
    if (day) return day.date;
    if (!week.nextStartDate) return null;
    week = await fetchWeek(week.nextStartDate);
  }
  return null;
}

/** Last date before `today` with games. */
async function previousGameDate(today) {
  let week = await fetchWeek(addDays(today, -7));
  for (let hop = 0; hop < 6 && week; hop += 1) {
    const days = (week.gameWeek ?? []).filter((d) => d.date < today && gameCount(d) > 0);
    if (days.length > 0) return days.at(-1).date;
    if (!week.previousStartDate) return null;
    week = await fetchWeek(week.previousStartDate);
  }
  return null;
}

/** Only what the scoreboard draws; the raw feed is far larger. */
const slimGame = (g) => ({
  id: g.id,
  gameState: g.gameState,
  startTimeUTC: g.startTimeUTC,
  awayTeam: { abbrev: g.awayTeam?.abbrev, score: g.awayTeam?.score },
  homeTeam: { abbrev: g.homeTeam?.abbrev, score: g.homeTeam?.score },
  periodDescriptor: g.periodDescriptor,
  clock: g.clock,
});

const NOT_STARTED = new Set(['FUT', 'PRE']);
/** Postponed/cancelled games would show a stale start time and a score that never comes. */
const isPlayable = (g) => !g.gameScheduleState || g.gameScheduleState === 'OK';

async function gamesOn(date) {
  const payload = await fetchJson(`${WEB_BASE}/score/${date}`, { label: `scores ${date}`, attempts: 3 });
  return (Array.isArray(payload?.games) ? payload.games : []).filter(isPlayable);
}

/**
 * The scoreboard, split by *status* rather than by date so it is always the
 * same two things: `scores` — games that have started or finished — and
 * `upcoming` — games that have not. Today's games are divided between the two
 * as they progress; with nothing started today, scores fall back to the most
 * recent game day, and with nothing left to play, upcoming falls back to the
 * next game day.
 *
 * The NHL's own `score/now` is deliberately not used: it reports the most
 * recent game day, which keeps pointing at yesterday's results for hours after
 * today's schedule has begun.
 */
async function buildScoreboard() {
  const today = etDate();
  const todays = await gamesOn(today);
  const started = todays.filter((g) => !NOT_STARTED.has(g.gameState));
  const waiting = todays.filter((g) => NOT_STARTED.has(g.gameState));

  let scores = started.length > 0 ? { date: today, games: started } : null;
  if (!scores) {
    const date = await previousGameDate(today);
    if (date) {
      const games = (await gamesOn(date)).filter((g) => !NOT_STARTED.has(g.gameState));
      // Last June's Final is not "latest scores" in October.
      if (games.length > 0 && date >= addDays(today, -14)) scores = { date, games };
    }
  }

  let upcoming = waiting.length > 0 ? { date: today, games: waiting } : null;
  if (!upcoming) {
    const date = await nextGameDate(today);
    if (date) {
      const games = (await gamesOn(date)).filter((g) => NOT_STARTED.has(g.gameState));
      if (games.length > 0) upcoming = { date, games };
    }
  }

  const slim = (block) => (block ? { date: block.date, games: block.games.map(slimGame) } : null);
  return { today, scores: slim(scores), upcoming: slim(upcoming) };
}

/** Today's games and the live standings. Cheap, so refreshed on every run. */
async function buildLive() {
  const results = {};

  for (const [name, load] of [
    ['scoreboard', buildScoreboard],
    ['standings', () => fetchJson(`${WEB_BASE}/standings/now`, { label: 'standings', attempts: 3 })],
  ]) {
    try {
      const payload = await load();
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
  const standingsMeta = await loadStandingsSeasonMeta();
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
      const divisionMap =
        item.kind === 'teams' ? await getDivisionMap(item.season.id, standingsMeta) : null;
      const cupChampion =
        item.kind === 'teams' ? await getStanleyCupChampion(item.season.id) : null;
      const rows = await buildSlice(item.season.id, item.kind, item.gameType, {
        teamLookup,
        divisionMap,
        cupChampion,
      });
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

  // Stanley Cup series files. Independent of the slices above on purpose: a
  // missing file is fetched on any normal run, so a deployed site gets every
  // season's Final without needing a forced full refresh.
  let cupFiles = 0;
  for (const season of seasons) {
    if (options.seasons && !options.seasons.includes(season.id)) continue;
    const present = await exists(path.join(OUT_DIR, `season/${season.id}/cup.json`));
    if (present && !options.force && !mutable.has(season.id)) continue;
    try {
      if (await buildCupFile(season.id)) cupFiles += 1;
    } catch (error) {
      console.warn(`  cup file for ${formatSeasonId(season.id)} failed: ${error.message}`);
    }
  }
  log(`Stanley Cup series: ${cupFiles} file(s) written.`);

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
