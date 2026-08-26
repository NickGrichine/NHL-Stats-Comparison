/** Value formatters. Every one of them has to survive a null. */

const DASH = '—';

export function fmtInt(value: unknown): string {
  if (value === null || value === undefined || value === '') return DASH;
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('en-US') : DASH;
}

export function fmtDecimal(places: number) {
  return (value: unknown): string => {
    if (value === null || value === undefined || value === '') return DASH;
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(places) : DASH;
  };
}

/** 0.13962 -> "14.0%" */
export function fmtPct(value: unknown, places = 1): string {
  if (value === null || value === undefined || value === '') return DASH;
  const n = Number(value);
  return Number.isFinite(n) ? `${(n * 100).toFixed(places)}%` : DASH;
}

/** Save percentage is shown the hockey way: .908, not 90.8%. */
export function fmtSavePct(value: unknown): string {
  if (value === null || value === undefined || value === '') return DASH;
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(3).replace(/^0/, '') : DASH;
}

/** 1271.37 seconds -> "21:11" */
export function fmtTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return DASH;
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return DASH;
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/** Total ice time can run to thousands of minutes; hours are unhelpful here. */
export function fmtTotalTime(value: unknown): string {
  if (value === null || value === undefined || value === '') return DASH;
  const seconds = Number(value);
  if (!Number.isFinite(seconds)) return DASH;
  return `${Math.round(seconds / 60).toLocaleString('en-US')} min`;
}

export function fmtSigned(value: unknown): string {
  if (value === null || value === undefined || value === '') return DASH;
  const n = Number(value);
  if (!Number.isFinite(n)) return DASH;
  return n > 0 ? `+${n}` : String(n);
}

export function fmtHeight(inches: unknown): string {
  if (inches === null || inches === undefined || inches === '') return DASH;
  const n = Number(inches);
  if (!Number.isFinite(n)) return DASH;
  return `${Math.floor(n / 12)}'${n % 12}"`;
}

/** "2 hours ago" for the data-freshness badge. */
export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'unknown';
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return 'unknown';

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 90) return 'just now';

  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'minute'],
    [3600, 'hour'],
    [86_400, 'day'],
    [2_592_000, 'month'],
  ];

  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  for (let i = 0; i < units.length; i += 1) {
    const entry = units[i];
    const next = units[i + 1];
    if (!entry) break;
    if (!next || seconds < next[0]) {
      return formatter.format(-Math.round(seconds / entry[0]), entry[1]);
    }
  }
  return formatter.format(-Math.round(seconds / 31_536_000), 'year');
}
