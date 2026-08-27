/**
 * Team codes → names and colours.
 *
 * Covers the current 32 clubs plus the historical codes that show up once you
 * go back past the 1990s. A handful of codes have been reused by different
 * franchises (COL was the Rockies before it was the Avalanche); where that
 * happens the modern club wins, since that is what a reader almost always
 * means, and the season shown alongside disambiguates it.
 */

interface TeamInfo {
  name: string;
  color: string;
  /** Set for clubs that no longer exist, so the UI can say so. */
  defunct?: boolean;
}

export const TEAMS: Record<string, TeamInfo> = {
  ANA: { name: 'Anaheim Ducks', color: '#F47A38' },
  BOS: { name: 'Boston Bruins', color: '#FFB81C' },
  BUF: { name: 'Buffalo Sabres', color: '#003087' },
  CAR: { name: 'Carolina Hurricanes', color: '#CE1126' },
  CBJ: { name: 'Columbus Blue Jackets', color: '#002654' },
  CGY: { name: 'Calgary Flames', color: '#D2001C' },
  CHI: { name: 'Chicago Blackhawks', color: '#CF0A2C' },
  COL: { name: 'Colorado Avalanche', color: '#6F263D' },
  DAL: { name: 'Dallas Stars', color: '#006847' },
  DET: { name: 'Detroit Red Wings', color: '#CE1126' },
  EDM: { name: 'Edmonton Oilers', color: '#FF4C00' },
  FLA: { name: 'Florida Panthers', color: '#C8102E' },
  LAK: { name: 'Los Angeles Kings', color: '#A2AAAD' },
  MIN: { name: 'Minnesota Wild', color: '#154734' },
  MTL: { name: 'Montreal Canadiens', color: '#AF1E2D' },
  NJD: { name: 'New Jersey Devils', color: '#CE1126' },
  NSH: { name: 'Nashville Predators', color: '#FFB81C' },
  NYI: { name: 'New York Islanders', color: '#00539B' },
  NYR: { name: 'New York Rangers', color: '#0038A8' },
  OTT: { name: 'Ottawa Senators', color: '#C8102E' },
  PHI: { name: 'Philadelphia Flyers', color: '#F74902' },
  PIT: { name: 'Pittsburgh Penguins', color: '#FCB514' },
  SEA: { name: 'Seattle Kraken', color: '#99D9D9' },
  SJS: { name: 'San Jose Sharks', color: '#006D75' },
  STL: { name: 'St. Louis Blues', color: '#002F87' },
  TBL: { name: 'Tampa Bay Lightning', color: '#002868' },
  TOR: { name: 'Toronto Maple Leafs', color: '#00205B' },
  UTA: { name: 'Utah Mammoth', color: '#71AFE5' },
  VAN: { name: 'Vancouver Canucks', color: '#00205B' },
  VGK: { name: 'Vegas Golden Knights', color: '#B4975A' },
  WPG: { name: 'Winnipeg Jets', color: '#041E42' },
  WSH: { name: 'Washington Capitals', color: '#C8102E' },

  // Relocated, renamed or folded.
  ARI: { name: 'Arizona Coyotes', color: '#8C2633', defunct: true },
  PHX: { name: 'Phoenix Coyotes', color: '#8C2633', defunct: true },
  ATL: { name: 'Atlanta Thrashers', color: '#5C88DA', defunct: true },
  AFM: { name: 'Atlanta Flames', color: '#D2001C', defunct: true },
  HFD: { name: 'Hartford Whalers', color: '#00843D', defunct: true },
  QUE: { name: 'Quebec Nordiques', color: '#0072CE', defunct: true },
  WIN: { name: 'Winnipeg Jets (1979-96)', color: '#041E42', defunct: true },
  MNS: { name: 'Minnesota North Stars', color: '#006847', defunct: true },
  CGS: { name: 'California Golden Seals', color: '#006847', defunct: true },
  OAK: { name: 'Oakland Seals', color: '#006847', defunct: true },
  CLE: { name: 'Cleveland Barons', color: '#8C2633', defunct: true },
  KCS: { name: 'Kansas City Scouts', color: '#0072CE', defunct: true },
  CLR: { name: 'Colorado Rockies', color: '#8C2633', defunct: true },
  MMR: { name: 'Montreal Maroons', color: '#8C2633', defunct: true },
  MWN: { name: 'Montreal Wanderers', color: '#AF1E2D', defunct: true },
  SEN: { name: 'Ottawa Senators (1917-34)', color: '#C8102E', defunct: true },
  HAM: { name: 'Hamilton Tigers', color: '#FFB81C', defunct: true },
  PIR: { name: 'Pittsburgh Pirates', color: '#FCB514', defunct: true },
  QUA: { name: 'Philadelphia Quakers', color: '#F74902', defunct: true },
  DCG: { name: 'Detroit Cougars', color: '#CE1126', defunct: true },
  DFL: { name: 'Detroit Falcons', color: '#CE1126', defunct: true },
  NYA: { name: 'New York Americans', color: '#0038A8', defunct: true },
  BRK: { name: 'Brooklyn Americans', color: '#0038A8', defunct: true },
  SLE: { name: 'St. Louis Eagles', color: '#002F87', defunct: true },
  TAN: { name: 'Toronto Arenas', color: '#00205B', defunct: true },
  TSP: { name: 'Toronto St. Patricks', color: '#00843D', defunct: true },
};

/** Fallback palette for entities with no known team colour. */
const SERIES_COLORS = ['#4F9CF9', '#F2545B', '#3DBE8B', '#F2B441', '#9B7BF7', '#E877B8'];

/** "EDM" -> "Edmonton Oilers". Unknown codes pass through unchanged. */
export function teamName(code: string | null | undefined): string {
  if (!code) return '';
  return TEAMS[code.trim().toUpperCase()]?.name ?? code;
}

/** "COL, CAR, DAL" -> "Colorado Avalanche, Carolina Hurricanes, Dallas Stars" */
export function teamNames(codes: string | null | undefined): string {
  if (!codes) return '';
  const seen = new Set<string>();
  return String(codes)
    .split(/[,\s]+/)
    .map((code) => code.trim())
    .filter(Boolean)
    .map(teamName)
    .filter((name) => (seen.has(name) ? false : (seen.add(name), true)))
    .join(', ');
}

/** The first listed team's colour — used to tint a series in the chart. */
export function teamColor(codes: string | null | undefined, fallbackIndex = 0): string {
  const first = String(codes ?? '')
    .split(/[,\s]+/)
    .map((code) => code.trim().toUpperCase())
    .find(Boolean);
  return (
    (first ? TEAMS[first]?.color : undefined) ??
    SERIES_COLORS[fallbackIndex % SERIES_COLORS.length] ??
    SERIES_COLORS[0]!
  );
}

/** 0 (black) – 1 (white), the WCAG relative-luminance formula. */
function relativeLuminance(hex: string): number {
  const full = hex.replace('#', '');
  const channel = (start: number) => {
    const c = parseInt(full.slice(start, start + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** Blend a hex colour toward white by `amount` (0–1). */
function lighten(hex: string, amount: number): string {
  const full = hex.replace('#', '');
  const mixed = [0, 2, 4].map((start) => {
    const c = parseInt(full.slice(start, start + 2), 16);
    return Math.round(c + (255 - c) * amount);
  });
  return `#${mixed.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Real team colours are chosen for a white rink, not a near-black page — half
 * the league's identity is a navy blue that all but disappears against the
 * dark theme's background. Lightens a colour just enough to stay visible
 * there; a colour that already reads fine (an Oilers orange, a Flames red)
 * passes through untouched.
 */
export function seriesColorForTheme(hex: string, theme: 'light' | 'dark'): string {
  if (theme === 'light') return hex;
  const luminance = relativeLuminance(hex);
  const floor = 0.18;
  if (luminance >= floor) return hex;
  return lighten(hex, Math.min(0.55, ((floor - luminance) / floor) * 0.6 + 0.15));
}

/**
 * Pick distinct colours for a set of series. Two Oilers seasons side by side
 * would otherwise be the same orange, so a duplicate falls back to the palette.
 */
export function seriesColors(codeLists: (string | null | undefined)[]): string[] {
  const used = new Set<string>();
  return codeLists.map((codes, index) => {
    const preferred = teamColor(codes, index);
    if (!used.has(preferred)) {
      used.add(preferred);
      return preferred;
    }
    const fallback =
      SERIES_COLORS.find((color) => !used.has(color)) ??
      SERIES_COLORS[index % SERIES_COLORS.length]!;
    used.add(fallback);
    return fallback;
  });
}

export const POSITIONS: Record<string, string> = {
  C: 'Center',
  L: 'Left Wing',
  LW: 'Left Wing',
  R: 'Right Wing',
  RW: 'Right Wing',
  D: 'Defenseman',
  G: 'Goaltender',
};

export function positionName(code: string | null | undefined): string {
  if (!code) return '';
  const seen = new Set<string>();
  return String(code)
    .split(/[/,\s]+/)
    .map((part) => part.trim().toUpperCase())
    .filter(Boolean)
    .map((part) => POSITIONS[part] ?? part)
    .filter((name) => (seen.has(name) ? false : (seen.add(name), true)))
    .join(', ');
}

/** Forward / defence / goal — the cohort a percentile is measured against. */
export function positionGroup(code: string | null | undefined): 'F' | 'D' | 'G' {
  const first = String(code ?? '').trim().toUpperCase().charAt(0);
  if (first === 'D') return 'D';
  if (first === 'G') return 'G';
  return 'F';
}

/** Official CDN assets. Both 404 gracefully, so the UI just hides the image. */
export function teamLogoUrl(code: string | null | undefined): string | null {
  if (!code) return null;
  const first = String(code).split(/[,\s]+/)[0]?.trim().toUpperCase();
  return first ? `https://assets.nhle.com/logos/nhl/svg/${first}_light.svg` : null;
}

export function headshotUrl(playerId: number, seasonId: number | string, team: string | null): string | null {
  const code = String(team ?? '').split(/[,\s]+/)[0]?.trim().toUpperCase();
  if (!code || seasonId === 'career') return null;
  return `https://assets.nhle.com/mugs/nhl/${seasonId}/${code}/${playerId}.png`;
}
