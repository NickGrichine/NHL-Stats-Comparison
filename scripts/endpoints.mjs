/**
 * What we ask the NHL API for, and how we shrink what comes back.
 *
 * The raw reports are verbose (25-35 keys per row, most of them redundant) and
 * inconsistently named. Each entity kind below declares the reports to merge,
 * the field order for the columnar encoder, and a `normalise` that maps a
 * merged raw row onto the compact record the app actually consumes.
 *
 * Keeping the mapping here — and only here — means the app never sees an NHL
 * field name, so an upstream rename is a one-file fix.
 */

/** Round to a fixed number of decimals, preserving null. */
const round = (value, decimals = 4) => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
};

/** Pass a value through, normalising undefined/NaN to null. */
const num = (value) => {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const str = (value) =>
  value === null || value === undefined || value === '' ? null : String(value);

export const SKATER_FIELDS = [
  'id', 'name', 'pos', 'shoots', 'teams',
  'gp', 'g', 'a', 'p', 'pGp',
  'evG', 'evP', 'ppG', 'ppP', 'shG', 'shP',
  'gwg', 'otg', 'pim', 'pm', 'sog', 'sPct', 'toi', 'foPct',
  'hits', 'blk', 'tka', 'gva',
  'birth', 'ht', 'wt', 'nat', 'dY', 'dR', 'dO',
];

export const GOALIE_FIELDS = [
  'id', 'name', 'catches', 'teams',
  'gp', 'gs', 'w', 'l', 'otl', 't',
  'sv', 'sa', 'svPct', 'ga', 'gaa', 'so', 'toi',
  'g', 'a', 'pim',
  'birth', 'ht', 'wt', 'nat',
];

export const TEAM_FIELDS = [
  'id', 'name', 'abbrev',
  'gp', 'w', 'l', 'otl', 't', 'pts', 'ptPct', 'row', 'winsReg', 'winsSo',
  'gf', 'ga', 'gfGp', 'gaGp', 'sfGp', 'saGp',
  'ppPct', 'pkPct', 'foPct', 'so',
];

/**
 * Entity definitions.
 *
 * `reports[].since` marks the first season a report has any data — the NHL did
 * not track hits or blocked shots before 1997-98, so asking for them earlier is
 * a wasted round trip rather than an error.
 */
export const ENTITIES = {
  skaters: {
    key: 'playerId',
    fields: SKATER_FIELDS,
    reports: [
      { name: 'skater/summary', required: true },
      { name: 'skater/realtime', since: 19971998 },
      { name: 'skater/bios' },
    ],
    normalise: (row) => ({
      id: num(row.playerId),
      name: str(row.skaterFullName),
      pos: str(row.positionCode),
      shoots: str(row.shootsCatches),
      teams: str(row.teamAbbrevs),
      gp: num(row.gamesPlayed),
      g: num(row.goals),
      a: num(row.assists),
      p: num(row.points),
      pGp: round(row.pointsPerGame, 4),
      evG: num(row.evGoals),
      evP: num(row.evPoints),
      ppG: num(row.ppGoals),
      ppP: num(row.ppPoints),
      shG: num(row.shGoals),
      shP: num(row.shPoints),
      gwg: num(row.gameWinningGoals),
      otg: num(row.otGoals),
      pim: num(row.penaltyMinutes),
      pm: num(row.plusMinus),
      sog: num(row.shots),
      sPct: round(row.shootingPct, 5),
      toi: round(row.timeOnIcePerGame, 1),
      foPct: round(row.faceoffWinPct, 5),
      hits: num(row.hits),
      blk: num(row.blockedShots),
      tka: num(row.takeaways),
      gva: num(row.giveaways),
      birth: str(row.birthDate)?.slice(0, 10) ?? null,
      ht: num(row.height),
      wt: num(row.weight),
      nat: str(row.nationalityCode ?? row.birthCountryCode),
      dY: num(row.draftYear),
      dR: num(row.draftRound),
      dO: num(row.draftOverall),
    }),
  },

  goalies: {
    key: 'playerId',
    fields: GOALIE_FIELDS,
    reports: [
      { name: 'goalie/summary', required: true },
      { name: 'goalie/bios' },
    ],
    normalise: (row) => ({
      id: num(row.playerId),
      name: str(row.goalieFullName),
      catches: str(row.shootsCatches),
      teams: str(row.teamAbbrevs),
      gp: num(row.gamesPlayed),
      gs: num(row.gamesStarted),
      w: num(row.wins),
      l: num(row.losses),
      otl: num(row.otLosses),
      t: num(row.ties),
      sv: num(row.saves),
      sa: num(row.shotsAgainst),
      svPct: round(row.savePct, 5),
      ga: num(row.goalsAgainst),
      gaa: round(row.goalsAgainstAverage, 4),
      so: num(row.shutouts),
      toi: num(row.timeOnIce),
      g: num(row.goals),
      a: num(row.assists),
      pim: num(row.penaltyMinutes),
      birth: str(row.birthDate)?.slice(0, 10) ?? null,
      ht: num(row.height),
      wt: num(row.weight),
      nat: str(row.nationalityCode ?? row.birthCountryCode),
    }),
  },

  teams: {
    key: 'teamId',
    fields: TEAM_FIELDS,
    reports: [{ name: 'team/summary', required: true }],
    normalise: (row) => ({
      id: num(row.teamId),
      name: str(row.teamFullName),
      abbrev: null, // filled in from the franchise/team lookup
      gp: num(row.gamesPlayed),
      w: num(row.wins),
      l: num(row.losses),
      otl: num(row.otLosses),
      t: num(row.ties),
      pts: num(row.points),
      ptPct: round(row.pointPct, 5),
      row: num(row.regulationAndOtWins),
      winsReg: num(row.winsInRegulation),
      winsSo: num(row.winsInShootout),
      gf: num(row.goalsFor),
      ga: num(row.goalsAgainst),
      gfGp: round(row.goalsForPerGame, 4),
      gaGp: round(row.goalsAgainstPerGame, 4),
      sfGp: round(row.shotsForPerGame, 4),
      saGp: round(row.shotsAgainstPerGame, 4),
      ppPct: round(row.powerPlayPct, 5),
      pkPct: round(row.penaltyKillPct, 5),
      foPct: round(row.faceoffWinPct, 5),
      so: num(row.teamShutouts),
    }),
  },
};

/**
 * Merge the rows of several reports on a shared key.
 *
 * Later reports fill gaps but never overwrite a value the primary report
 * already provided, and rows that only appear in a secondary report are
 * dropped — a player with a bio but no summary row did not play that season.
 *
 * @param {string} key
 * @param {Record<string, unknown>[][]} reportRows primary first
 * @returns {Record<string, unknown>[]}
 */
export function mergeReports(key, reportRows) {
  const [primary = [], ...rest] = reportRows;
  const merged = new Map();

  for (const row of primary) {
    const id = row[key];
    if (id === null || id === undefined) continue;
    merged.set(id, { ...row });
  }

  for (const rows of rest) {
    for (const row of rows) {
      const target = merged.get(row[key]);
      if (!target) continue;
      for (const [field, value] of Object.entries(row)) {
        if (target[field] === null || target[field] === undefined) {
          target[field] = value;
        }
      }
    }
  }

  return [...merged.values()];
}

/**
 * Build the cayenne expression the stats API filters on.
 *
 * @param {{ seasonId?: number, gameType?: number }} filters
 * @returns {string}
 */
export function cayenne({ seasonId, gameType }) {
  const clauses = [];
  if (seasonId) clauses.push(`seasonId=${seasonId}`);
  if (gameType) clauses.push(`gameTypeId=${gameType}`);
  return clauses.join(' and ');
}
