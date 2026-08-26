/**
 * Columnar JSON codec.
 *
 * An array of ~1000 objects that all share the same ~25 keys repeats those key
 * names 1000 times. Storing the field names once and the values as plain arrays
 * cuts a modern season file roughly in half before gzip even runs.
 *
 * Shared verbatim between the Node data pipeline (scripts/) and the browser
 * app (src/), so an encoding change can never drift between the two.
 */

/** Payload format version. Bump when the shape below changes incompatibly. */
export const CODEC_VERSION = 1;

/**
 * Encode an array of flat objects into a columnar payload.
 *
 * Fields that are `null`/`undefined` for every row are dropped entirely — this
 * is how era-missing stats disappear rather than becoming misleading zeroes
 * (there is no power-play percentage in 1943, and the file should say so by
 * omission).
 *
 * @param {Record<string, unknown>[]} rows
 * @param {{ fields?: string[], meta?: Record<string, unknown> }} [options]
 * @returns {{ v: number, f: string[], r: unknown[][], count: number } & Record<string, unknown>}
 */
export function encodeColumnar(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const meta = options.meta ?? {};

  // Field order: caller-supplied order first, then any straggler keys, so the
  // important columns stay at a stable index and diffs stay readable.
  const seen = new Set();
  const fields = [];
  for (const name of options.fields ?? []) {
    if (!seen.has(name)) {
      seen.add(name);
      fields.push(name);
    }
  }
  for (const row of list) {
    for (const name of Object.keys(row)) {
      if (!seen.has(name)) {
        seen.add(name);
        fields.push(name);
      }
    }
  }

  const populated = fields.filter((name) =>
    list.some((row) => row[name] !== null && row[name] !== undefined),
  );

  const r = list.map((row) =>
    populated.map((name) => {
      const value = row[name];
      return value === undefined ? null : value;
    }),
  );

  return { v: CODEC_VERSION, ...meta, count: list.length, f: populated, r };
}

/**
 * Decode a columnar payload back into objects.
 *
 * Tolerates a plain array of objects too, so a hand-written fixture or a future
 * uncompressed file still loads.
 *
 * @param {unknown} payload
 * @returns {Record<string, unknown>[]}
 */
export function decodeColumnar(payload) {
  if (Array.isArray(payload)) return /** @type {Record<string, unknown>[]} */ (payload);
  if (!payload || typeof payload !== 'object') return [];

  const { f, r } = /** @type {{ f?: unknown, r?: unknown }} */ (payload);
  if (!Array.isArray(f) || !Array.isArray(r)) return [];

  const fields = /** @type {string[]} */ (f);
  return /** @type {unknown[][]} */ (r).map((values) => {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (let i = 0; i < fields.length; i += 1) {
      const key = fields[i];
      if (key === undefined) continue;
      out[key] = values[i] ?? null;
    }
    return out;
  });
}

/**
 * Read the metadata attached to a payload without decoding every row.
 *
 * @param {unknown} payload
 * @returns {Record<string, unknown>}
 */
export function payloadMeta(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const { f: _f, r: _r, ...meta } = /** @type {Record<string, unknown>} */ (payload);
  return meta;
}
