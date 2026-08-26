/**
 * A small, polite HTTP client for the NHL's public stats API.
 *
 * The API is free and keyless but entirely undocumented and unsupported, so
 * this client assumes nothing: it retries transient failures with exponential
 * backoff, caps how many requests are in flight at once, and identifies itself
 * honestly in the User-Agent so the NHL can see who is calling.
 *
 * Note that these hosts do NOT send permissive CORS headers, which is exactly
 * why this runs in CI rather than in the browser.
 */

export const STATS_BASE = 'https://api.nhle.com/stats/rest/en';
export const WEB_BASE = 'https://api-web.nhle.com/v1';

const USER_AGENT =
  'NHL-Players-Comparison/2.0 (+https://github.com/NickGrichine/NHL-Players-Comparison) node-fetch';

const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 600;
const REQUEST_TIMEOUT_MS = 45_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch JSON with retries. Throws only after every attempt has been exhausted.
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: controller.signal,
      });

      // 4xx other than 429 will not fix themselves; fail immediately so a typo
      // in a cayenne expression surfaces as an error instead of a slow retry.
      if (!response.ok && response.status !== 429 && response.status < 500) {
        throw new Error(`${label}: HTTP ${response.status} ${response.statusText}`);
      }

      if (!response.ok) {
        throw new Error(`${label}: HTTP ${response.status} (retryable)`);
      }

      return await response.json();
    } catch (error) {
      lastError = error;
      const fatal = error instanceof Error && /HTTP 4\d\d(?! \(retryable\))/.test(error.message);
      if (fatal || attempt === attempts) break;

      const backoff = BASE_DELAY_MS * 2 ** (attempt - 1) + Math.random() * 250;
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
 * Run tasks with a bounded number in flight. Keeps us from opening 600
 * simultaneous connections to an API that is doing us a favour by existing.
 *
 * @template T
 * @param {(() => Promise<T>)[]} tasks
 * @param {number} [limit]
 * @returns {Promise<T[]>}
 */
export async function pooled(tasks, limit = 4) {
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
