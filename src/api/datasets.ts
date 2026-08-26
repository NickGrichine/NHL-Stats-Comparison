/**
 * Loading the static dataset.
 *
 * Everything here is a same-origin GET against files the GitHub Actions
 * pipeline published — no API keys, no proxy, and no CORS, because the NHL API
 * was called at build time rather than from the browser.
 *
 * Requests are de-duplicated and cached for the life of the page: flipping
 * between two seasons and back should not refetch either of them.
 */

import { decodeColumnar } from '../../shared/codec.mjs';
import type {
  EntityKind,
  GameType,
  Manifest,
  PlayerIndexEntry,
  SeasonScope,
  StatRow,
} from '../types';

const DATA_ROOT = `${import.meta.env.BASE_URL}data/`;

const cache = new Map<string, Promise<unknown>>();

/** Marker for "the pipeline knows this file does not exist" (no playoffs that year). */
const EMPTY: StatRow[] = [];

async function getJson(relativePath: string): Promise<unknown | null> {
  const response = await fetch(`${DATA_ROOT}${relativePath}`, {
    headers: { Accept: 'application/json' },
  });

  // A missing slice is a normal answer, not a failure: there were no playoffs
  // in 2004-05 and no goalie report in 1917-18.
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Could not load ${relativePath} (HTTP ${response.status})`);
  }
  return response.json();
}

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const existing = cache.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = load().catch((error) => {
    // Do not cache a failure — a transient network blip should not poison the
    // key for the rest of the session.
    cache.delete(key);
    throw error;
  });

  cache.set(key, promise);
  return promise;
}

export function loadManifest(): Promise<Manifest> {
  return cached('manifest', async () => {
    const payload = await getJson('manifest.json');
    if (!payload) throw new Error('The dataset has not been published yet.');
    return payload as Manifest;
  });
}

export function loadPlayerIndex(): Promise<PlayerIndexEntry[]> {
  return cached('index/players', async () => {
    const payload = await getJson('index/players.json');
    if (!payload) return [];
    return decodeColumnar(payload) as unknown as PlayerIndexEntry[];
  });
}

export interface FranchiseIndex {
  rows: { id: number; name: string; common: string | null; place: string | null }[];
  teamLookup: Record<string, string>;
}

export function loadFranchiseIndex(): Promise<FranchiseIndex> {
  return cached('index/franchises', async () => {
    const payload = (await getJson('index/franchises.json')) as FranchiseIndex | null;
    return payload ?? { rows: [], teamLookup: {} };
  });
}

/**
 * One season slice — every skater, goalie or team for that season and game
 * type. This is the unit the radar's percentile cohort is drawn from, which is
 * why the whole population is loaded rather than just the selected entities.
 */
export function loadDataset(
  kind: EntityKind,
  season: SeasonScope,
  gameType: GameType,
): Promise<StatRow[]> {
  const key = `${kind}/${season}/${gameType}`;

  return cached(key, async () => {
    const path =
      season === 'career'
        ? `career/${kind}-${gameType}.json`
        : `season/${season}/${kind}-${gameType}.json`;

    const payload = await getJson(path);
    if (!payload) return EMPTY;
    return decodeColumnar(payload) as unknown as StatRow[];
  });
}

export interface LiveFile<T = unknown> {
  fetchedAt: string;
  payload: T;
}

export function loadLive<T>(name: 'scoreboard' | 'standings'): Promise<LiveFile<T> | null> {
  return cached(`live/${name}`, async () => {
    const payload = await getJson(`live/${name}.json`);
    return (payload as LiveFile<T> | null) ?? null;
  });
}

/** Team comparison has no career mode — franchises do not have a career. */
export function supportsCareer(kind: EntityKind): boolean {
  return kind !== 'teams';
}
