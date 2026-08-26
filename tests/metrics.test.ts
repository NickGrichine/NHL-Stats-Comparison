import { describe, expect, it } from 'vitest';

import { METRICS, availableMetrics, metricsByGroup, radarMetrics } from '../src/lib/metrics';
import type { StatRow } from '../src/types';

const modernSkater = (over: Partial<StatRow> = {}): StatRow =>
  ({
    id: 1,
    name: 'Modern',
    pos: 'C',
    gp: 82,
    g: 40,
    a: 60,
    p: 100,
    pGp: 1.22,
    evG: 25,
    evP: 60,
    ppG: 15,
    ppP: 38,
    shG: 0,
    shP: 0,
    gwg: 8,
    otg: 2,
    sog: 280,
    sPct: 0.142,
    toi: 1250,
    pm: 15,
    pim: 40,
    foPct: 0.52,
    hits: 60,
    blk: 30,
    tka: 55,
    gva: 45,
    ...over,
  }) as StatRow;

// The pipeline drops all-null columns, so a 1940s season genuinely arrives
// without a hits field rather than with a field full of zeroes.
const vintageSkater = (): StatRow =>
  ({
    id: 2,
    name: 'Vintage',
    pos: 'L',
    gp: 50,
    g: 20,
    a: 20,
    p: 40,
    pGp: 0.8,
    sog: null,
    sPct: null,
    toi: null,
    pm: null,
    hits: null,
    blk: null,
    tka: null,
    gva: null,
    ppP: null,
    evP: null,
    pim: 22,
  }) as StatRow;

describe('availableMetrics', () => {
  it('keeps every metric a modern season populates', () => {
    const metrics = availableMetrics('skaters', [modernSkater()]);
    const keys = metrics.map((metric) => metric.key);

    expect(keys).toContain('hits');
    expect(keys).toContain('toi');
    expect(keys).toContain('sPct');
  });

  it('drops metrics the league was not tracking yet', () => {
    const metrics = availableMetrics('skaters', [vintageSkater()]);
    const keys = metrics.map((metric) => metric.key);

    expect(keys).toContain('g');
    expect(keys).toContain('p');
    expect(keys).not.toContain('hits');
    expect(keys).not.toContain('toi');
    expect(keys).not.toContain('pm');
  });

  it('keeps a metric that at least one row populates', () => {
    const metrics = availableMetrics('skaters', [vintageSkater(), modernSkater()]);
    expect(metrics.map((m) => m.key)).toContain('hits');
  });

  it('returns the full set rather than nothing when there are no rows', () => {
    expect(availableMetrics('skaters', [])).toEqual(METRICS.skaters);
  });
});

describe('radarMetrics', () => {
  it('uses the curated radar set for a modern season', () => {
    const radar = radarMetrics('skaters', [modernSkater()]);
    expect(radar.length).toBeGreaterThanOrEqual(6);
    expect(radar.every((metric) => metric.radar)).toBe(true);
  });

  // Three axes is a triangle, which reads as noise rather than a shape.
  it('never returns fewer than four axes while any stat is available', () => {
    const radar = radarMetrics('skaters', [vintageSkater()]);
    expect(radar.length).toBeGreaterThanOrEqual(4);
  });
});

describe('metric definitions', () => {
  it('has no duplicate keys within an entity kind', () => {
    for (const [kind, metrics] of Object.entries(METRICS)) {
      const keys = metrics.map((metric) => metric.key);
      expect(new Set(keys).size, `${kind} has duplicate metric keys`).toBe(keys.length);
    }
  });

  it('marks the stats where a lower number is better', () => {
    const gaa = METRICS.goalies.find((metric) => metric.key === 'gaa');
    const gaGp = METRICS.teams.find((metric) => metric.key === 'gaGp');
    expect(gaa?.invert).toBe(true);
    expect(gaGp?.invert).toBe(true);
  });

  it('gives every metric a label, a short name and a formatter', () => {
    for (const metrics of Object.values(METRICS)) {
      for (const metric of metrics) {
        expect(metric.short.length).toBeGreaterThan(0);
        expect(metric.label.length).toBeGreaterThan(0);
        expect(typeof metric.format).toBe('function');
        expect(metric.format(null)).toBe('—');
      }
    }
  });

  it('groups metrics without losing any', () => {
    const grouped = metricsByGroup(METRICS.skaters);
    const total = grouped.reduce((sum, [, list]) => sum + list.length, 0);
    expect(total).toBe(METRICS.skaters.length);
  });
});
