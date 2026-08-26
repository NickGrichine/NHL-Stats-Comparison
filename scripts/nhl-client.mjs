/**
 * A small, polite HTTP client for the NHL's public stats API.
 *
 * The API is free and keyless but entirely undocumented and unsupported, and it
 * *does* rate-limit. Three things keep this well-behaved:
 *
 *   1. A global minimum interval between request starts, so a backfill of
 *      ~1,500 requests trickles rather than floods.
 *   2. A shared cool-down. When any request gets a 429, every other in-flight
 *      and queued request waits too. Backing off per-request is useless — the
 *      other workers just keep hammering while one sleeps, which is exactly how
 *      the first version of this failed.
 *   3. Long, Retry-After-aware backoff on 429 specifically. A rate limit is not
 *      a transient blip and cannot be outrun in a few hundred milliseconds.
 *
 * These hosts also send no permissive CORS headers, which is why this runs in
 * CI rather than in the browser.
 */

export const STATS_BASE = 'https://api.nhle.com/stats/rest/en';
export const WEB_BASE = 'https://api-web.nhle.com/v1';

const USER_AGENT =
  'NHL-Stats-Comparison/2.0 (+https://github.com/NickGrichine/NHL-Stats-Comparison) node-fetch';

/** Minimum gap between the start of any two requests (~3/second). */
const MIN_INTERVAL_MS = 350;

const MAX_ATTEMPTS = 8;
/** 429 is a rate limit, not a blip — start the backoff in seconds, not millis. */
const RATE_LIMIT_BASE_MS = 5_000;
const RATE_LIMIT_MAX_MS = 90_000;
/** Ordinary 5xx / network errors recover much faster. */
const TRANSIENT_BASE_MS = 750;

const REQUEST_TIMEOUT_MS = 45_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* ------------------------------------------------------------ throttling */

/** Serialises request *starts* MIN_INTERVAL_MS apart; the requests themselves overlap. */
let queue = Promise.resolve();
/** Epoch ms until which every request must hold off. Set when anyone sees a 429. */
let pausedUntil = 0;

function takeSlot() {
  const slot = queue.then(async () => {
    for (;;) {
      const wait = pausedUntil - Date.now();
      if (wait <= 0) return;
      await sleep(wait);
    }
  });
  queue = slot.then(() => sleep(MIN_INTERVAL_MS));
  return slot;
}

/** Make everyone wait. Never shortens an existing, longer cool-down. */
function pauseAll(ms, reason) {
  const until = Date.now() + ms;
  if (until <= pausedUntil) return;
  pausedUntil = until;
  console.warn(`  rate limited — pausing all requests ${Math.round(ms / 1000)}s (${reason})`);
}

/** Honour Retry-After when the server bothers to send it. */
function retryAfterMs(response) {
  const header = response.headers.get('retry-after');
  if (!header) return null;

  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

/* -------------------------------------------------------------- fetching */

class HttpError extends Error {
  constructor(status, label) {
    super(`${label}: HTTP ${status}`);
    this.status = status;
  }
}

/**
 * Fetch JSON, retrying transient failures. Throws only once every attempt is spent.
 *
 * @param {string} url
 * @param {{ attempts?: number, label?: string }} [options]
 * @returns {Promise<unknown>}
 */
export async function fetchJson(url, options = {}) {
  const attempts = options.attempts ?? MAX_ATTEMPTS;
  const label = options.label ?? url;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await takeSlot();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
      });

      if (response.status === 429) {
        const backoff = Math.min(
          retryAfterMs(response) ?? RATE_LIMIT_BASE_MS * 2 ** (attempt - 1),
          RATE_LIMIT_MAX_MS,
        );
        pauseAll(backoff + Math.random() * 500, `${label}, attempt ${attempt}/${attempts}`);
        lastError = new HttpError(429, label);
        continue;
      }

      // Any other 4xx will not fix itself, so surface a bad query immediately
      // instead of burning eight attempts on it.
      if (response.status >= 400 && response.status < 500) {
        throw new HttpError(response.status, label);
      }

      if (!response.ok) {
        lastError = new HttpError(response.status, label);
        const backoff = TRANSIENT_BASE_MS * 2 ** (attempt - 1) + Math.random() * 250;
        if (attempt < attempts) await sleep(backoff);
        continue;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof HttpError && error.status !== 429 && error.status < 500) throw error;

      lastError = error;
      if (attempt === attempts) break;

      const backoff = TRANSIENT_BASE_MS * 2 ** (attempt - 1) + Math.random() * 250;
      console.warn(`  retry ${attempt}/${attempts - 1} in ${Math.round(backoff)}ms — ${label}`);
      await sleep(backoff);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label}: failed`);
}

/**
 * Fetch a stats report. `limit=-1` returns the entire result set in one
 * response, which every report supports — verified back to 1917-18.
 *
 * @param {string} report e.g. 'skater/summary'
 * @param {{ cayenneExp?: string, isAggregate?: boolean, sort?: string }} [params]
 * @returns {Promise<{ data: Record<string, unknown>[], total: number }>}
 */
export async function fetchReport(report, params = {}) {
  const query = new URLSearchParams({ limit: '-1', start: '0' });
  if (params.cayenneExp) query.set('cayenneExp', params.cayenneExp);
  if (params.isAggregate) query.set('isAggregate', 'true');
  if (params.sort) query.set('sort', params.sort);

  const url = `${STATS_BASE}/${report}?${query.toString()}`;
  const payload = await fetchJson(url, { label: report });

  const data = Array.isArray(payload?.data) ? payload.data : [];
  const total = typeof payload?.total === 'number' ? payload.total : data.length;
  return { data, total };
}

/**
 * Run tasks with a bounded number in flight.
 *
 * @template T
 * @param {(() => Promise<T>)[]} tasks
 * @param {number} [limit]
 * @returns {Promise<T[]>}
 */
export async function pooled(tasks, limit = 2) {
  const results = new Array(tasks.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      const task = tasks[index];
      if (task) results[index] = await task();
    }
  });

  await Promise.all(workers);
  return results;
}
