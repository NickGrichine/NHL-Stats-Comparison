/**
 * Season-id helpers.
 *
 * The NHL encodes a season as two concatenated years: 20242025 is 2024-25.
 * Shared between the pipeline and the app so the two never disagree about
 * which season is "current".
 */

export const GAME_TYPE = /** @type {const} */ ({ REGULAR: 2, PLAYOFFS: 3 });

/** Earliest season the NHL stats API carries. */
export const FIRST_SEASON_ID = 19171918;

/**
 * 20242025 -> "2024-25"
 * @param {number | string} seasonId
 * @returns {string}
 */
export function formatSeasonId(seasonId) {
  const s = String(seasonId);
  if (s.length !== 8) return s;
  return `${s.slice(0, 4)}-${s.slice(6, 8)}`;
}

/**
 * 2024 -> 20242025
 * @param {number} startYear
 * @returns {number}
 */
export function seasonIdFromStartYear(startYear) {
  return startYear * 10000 + (startYear + 1);
}

/**
 * @param {number | string} seasonId
 * @returns {number}
 */
export function startYearOf(seasonId) {
  return Number(String(seasonId).slice(0, 4));
}

/**
 * The season that is currently being played, or the one most recently finished.
 *
 * The NHL year rolls over in the summer: from July onward the upcoming season
 * is the interesting one, before that it is the season in progress.
 *
 * @param {Date} [now]
 * @returns {number}
 */
export function currentSeasonId(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth(); // 0-indexed
  const startYear = month >= 6 ? year : year - 1;
  return seasonIdFromStartYear(startYear);
}

/**
 * Seasons whose data can still change and therefore must be refetched.
 * Everything older is immutable and is fetched exactly once, ever.
 *
 * The previous season is included because playoff and award data trickles in
 * after the regular season ends.
 *
 * @param {Date} [now]
 * @returns {number[]}
 */
export function mutableSeasonIds(now = new Date()) {
  const current = currentSeasonId(now);
  const previous = seasonIdFromStartYear(startYearOf(current) - 1);
  return [previous, current];
}

/**
 * Is the league plausibly playing games right now? Used to decide whether the
 * live scoreboard is worth refreshing every half hour.
 *
 * @param {Date} [now]
 * @returns {boolean}
 */
export function inSeason(now = new Date()) {
  const month = now.getUTCMonth();
  return month >= 8 || month <= 5; // September through June
}
