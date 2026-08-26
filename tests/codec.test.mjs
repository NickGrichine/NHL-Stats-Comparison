import { describe, expect, it } from 'vitest';

import { decodeColumnar, encodeColumnar, payloadMeta } from '../shared/codec.mjs';

describe('columnar codec', () => {
  it('round-trips rows unchanged', () => {
    const rows = [
      { id: 1, name: 'Kucherov', g: 37, a: 84 },
      { id: 2, name: 'MacKinnon', g: 32, a: 84 },
    ];

    expect(decodeColumnar(encodeColumnar(rows))).toEqual(rows);
  });

  it('honours the requested field order', () => {
    const payload = encodeColumnar([{ b: 2, a: 1 }], { fields: ['a', 'b'] });
    expect(payload.f).toEqual(['a', 'b']);
    expect(payload.r).toEqual([[1, 2]]);
  });

  it('keeps fields the caller asked for that appear only on later rows', () => {
    const payload = encodeColumnar([{ a: 1 }, { a: 2, b: 9 }], { fields: ['a', 'b'] });
    expect(payload.f).toEqual(['a', 'b']);
    expect(decodeColumnar(payload)).toEqual([
      { a: 1, b: null },
      { a: 2, b: 9 },
    ]);
  });

  // This is the mechanism that stops a stat the league never tracked from
  // being plotted as a zero: it is not in the file at all.
  it('drops a column that is null for every row', () => {
    const payload = encodeColumnar([
      { g: 5, ppG: null },
      { g: 7, ppG: null },
    ]);

    expect(payload.f).toEqual(['g']);
    expect(decodeColumnar(payload)).toEqual([{ g: 5 }, { g: 7 }]);
  });

  it('keeps a column that is null for only some rows', () => {
    const payload = encodeColumnar([{ g: 5, foPct: null }, { g: 7, foPct: 0.51 }]);
    expect(payload.f).toEqual(['g', 'foPct']);
  });

  it('normalises undefined to null', () => {
    const payload = encodeColumnar([{ a: 1, b: undefined }, { a: 2, b: 3 }]);
    expect(decodeColumnar(payload)).toEqual([
      { a: 1, b: null },
      { a: 2, b: 3 },
    ]);
  });

  it('carries metadata alongside the rows', () => {
    const payload = encodeColumnar([{ a: 1 }], {
      meta: { kind: 'skaters', seasonId: 20242025, gameType: 2 },
    });

    expect(payloadMeta(payload)).toMatchObject({
      kind: 'skaters',
      seasonId: 20242025,
      gameType: 2,
      count: 1,
    });
  });

  it('survives junk without throwing', () => {
    expect(decodeColumnar(null)).toEqual([]);
    expect(decodeColumnar(undefined)).toEqual([]);
    expect(decodeColumnar({})).toEqual([]);
    expect(decodeColumnar('nope')).toEqual([]);
  });

  it('accepts a plain array of objects for backwards compatibility', () => {
    const rows = [{ a: 1 }];
    expect(decodeColumnar(rows)).toEqual(rows);
  });

  it('is meaningfully smaller than array-of-objects for realistic data', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({
      id: 8400000 + i,
      skaterFullName: `Player Number ${i}`,
      gamesPlayed: 82,
      goals: i % 50,
      assists: i % 70,
      points: (i % 50) + (i % 70),
    }));

    const columnar = JSON.stringify(encodeColumnar(rows)).length;
    const plain = JSON.stringify(rows).length;
    expect(columnar).toBeLessThan(plain * 0.5);
  });
});
