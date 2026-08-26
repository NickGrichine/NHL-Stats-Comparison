import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ENTITIES, cayenne, mergeReports } from '../scripts/endpoints.mjs';
import { decodeColumnar, encodeColumnar } from '../shared/codec.mjs';

const fixture = (name) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./fixtures/${name}.json`, import.meta.url)), 'utf8'));

/** Run one fixture through the exact path the pipeline uses. */
function run(kind, reportRows, extra = {}) {
  const entity = ENTITIES[kind];
  const merged = mergeReports(entity.key, reportRows);
  const rows = merged.map((row) => {
    const record = entity.normalise(row);
    if (kind === 'teams' && extra.teamLookup) {
      record.abbrev = extra.teamLookup[record.id] ?? null;
    }
    return record;
  });
  return decodeColumnar(encodeColumnar(rows, { fields: entity.fields }));
}

describe('skater normalisation', () => {
  const rows = run('skaters', [fixture('skater-summary-20242025').data]);

  it('maps the NHL field names onto ours', () => {
    expect(rows[0]).toMatchObject({
      id: 8476453,
      name: 'Nikita Kucherov',
      pos: 'R',
      shoots: 'L',
      teams: 'TBL',
      gp: 78,
      g: 37,
      a: 84,
      p: 121,
      evP: 75,
      ppP: 46,
      sog: 265,
      pim: 45,
      pm: 22,
    });
  });

  it('keeps rate stats at usable precision', () => {
    expect(rows[0].pGp).toBeCloseTo(1.5513, 4);
    expect(rows[0].sPct).toBeCloseTo(0.13962, 5);
    expect(rows[0].toi).toBeCloseTo(1271.4, 1);
  });

  it('keeps every player in the report', () => {
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.name)).toEqual(['Nikita Kucherov', 'Nathan MacKinnon']);
  });
});

describe('era gaps', () => {
  const modern = run('skaters', [fixture('skater-summary-20242025').data]);
  const vintage = run('skaters', [fixture('skater-summary-19171918').data]);

  // 1917-18 recorded goals and assists and almost nothing else. Those columns
  // must disappear rather than arrive as zeroes.
  it('drops columns the league was not tracking in 1917-18', () => {
    expect(vintage[0]).not.toHaveProperty('pm');
    expect(vintage[0]).not.toHaveProperty('sPct');
    expect(vintage[0]).not.toHaveProperty('toi');
    expect(vintage[0]).not.toHaveProperty('ppP');
  });

  it('still carries what 1917-18 did record', () => {
    expect(vintage[0]).toMatchObject({
      id: 8449231,
      name: 'Ken Thompson',
      pos: 'L',
      teams: 'MWN',
      gp: 1,
      g: 0,
      a: 0,
      p: 0,
    });
  });

  it('keeps those same columns for a modern season', () => {
    expect(modern[0]).toHaveProperty('pm');
    expect(modern[0]).toHaveProperty('toi');
  });
});

describe('goalie normalisation', () => {
  const rows = run('goalies', [fixture('goalie-summary-20242025').data]);

  it('maps the goalie report', () => {
    expect(rows[0]).toMatchObject({
      id: 8473503,
      name: 'James Reimer',
      catches: 'L',
      gp: 24,
      gs: 21,
      w: 10,
      l: 10,
      otl: 2,
      sv: 594,
      sa: 662,
      ga: 69,
      so: 1,
      toi: 81770,
    });
    expect(rows[0].svPct).toBeCloseTo(0.89728, 5);
    expect(rows[0].gaa).toBeCloseTo(3.0378, 4);
  });

  it('preserves multi-team strings intact', () => {
    expect(rows[0].teams).toBe('ANA,BUF');
  });
});

describe('team normalisation', () => {
  const rows = run('teams', [fixture('team-summary-19671968').data], {
    teamLookup: { 19: 'STL', 17: 'DET' },
  });

  it('maps the team report and attaches an abbreviation', () => {
    expect(rows[0]).toMatchObject({
      id: 19,
      name: 'St. Louis Blues',
      abbrev: 'STL',
      gp: 74,
      w: 27,
      l: 31,
      t: 16,
      pts: 70,
      gf: 177,
      ga: 191,
      so: 6,
    });
  });

  // Ties existed, special teams percentages did not. Both facts have to
  // survive into the published file.
  it('keeps ties and drops the special-teams stats of the era', () => {
    expect(rows[0].t).toBe(16);
    expect(rows[0]).not.toHaveProperty('ppPct');
    expect(rows[0]).not.toHaveProperty('pkPct');
    expect(rows[0]).not.toHaveProperty('foPct');
  });
});

describe('mergeReports', () => {
  it('fills gaps from a secondary report without overwriting the primary', () => {
    const merged = mergeReports('playerId', [
      [{ playerId: 1, goals: 10, hits: null }],
      [{ playerId: 1, goals: 999, hits: 42 }],
    ]);

    expect(merged).toEqual([{ playerId: 1, goals: 10, hits: 42 }]);
  });

  it('ignores rows that exist only in a secondary report', () => {
    const merged = mergeReports('playerId', [
      [{ playerId: 1, goals: 10 }],
      [
        { playerId: 1, hits: 5 },
        { playerId: 2, hits: 7 },
      ],
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].playerId).toBe(1);
  });

  it('skips rows with no key', () => {
    expect(mergeReports('playerId', [[{ goals: 1 }, { playerId: 2, goals: 3 }]])).toHaveLength(1);
  });
});

describe('cayenne', () => {
  it('builds the filter expression the stats API expects', () => {
    expect(cayenne({ seasonId: 20242025, gameType: 2 })).toBe(
      'seasonId=20242025 and gameTypeId=2',
    );
    expect(cayenne({ gameType: 3 })).toBe('gameTypeId=3');
    expect(cayenne({})).toBe('');
  });
});
