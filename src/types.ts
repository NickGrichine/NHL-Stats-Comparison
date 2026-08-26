export type EntityKind = 'skaters' | 'goalies' | 'teams';

/** 2 = regular season, 3 = playoffs. Matches the NHL's own gameTypeId. */
export type GameType = 2 | 3;

/** A specific season, or the all-time aggregate. */
export type SeasonScope = number | 'career';

/**
 * One decoded row: a player-season, a goalie-season or a team-season.
 *
 * The field names are ours, not the NHL's — see scripts/endpoints.mjs for the
 * mapping. Values are numbers, strings or null; null means "the league did not
 * track this stat that year", which is a meaningfully different thing from 0.
 */
export interface StatRow {
  id: number;
  name: string;
  [key: string]: number | string | null;
}

export interface SeasonMeta {
  id: number;
  label: string;
  /** Total regular-season games league-wide. */
  games: number | null;
  /** Games per team that season — 82 today, 70 in 1953-54. */
  perTeam: number | null;
  playoffGames: number | null;
  /** Whether ties were still possible. */
  ties: boolean;
}

export interface Manifest {
  schema: number;
  generatedAt: string;
  liveFetchedAt: string;
  currentSeason: number;
  seasons: SeasonMeta[];
  /** counts[seasonId]['skaters-2'] = row count. 0 means "known empty". */
  counts: Record<string, Record<string, number>>;
}

/** An entry in the all-time player search index. */
export interface PlayerIndexEntry {
  id: number;
  name: string;
  pos: string | null;
  kind: 'skaters' | 'goalies';
  first: number;
  last: number;
  teams: string;
}

/** One thing being compared: an entity pinned to a season and game type. */
export interface Selection {
  kind: EntityKind;
  id: number;
  season: SeasonScope;
  gameType: GameType;
}
