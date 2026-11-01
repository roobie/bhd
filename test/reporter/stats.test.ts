// Paired statistics on synthetic data: bootstrap, pairing, Benjamini-Hochberg, tags, divergence.
// Math and specced behaviour only; no gameplay assertions.

import { describe, expect, it } from 'vitest';
import { firstDivergence } from '../../src/reporter/diverge.ts';
import {
  benjaminiHochberg,
  bootstrapMean,
  buildReport,
  pairRuns,
  reportJson,
  tagMatches,
} from '../../src/reporter/stats.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { logOf, makeInput, metric, normals, run } from './synth.ts';

describe('bootstrapMean', () => {
  it('gives a zero-width CI for a constant difference', () => {
    for (const d of [0, 2.5, -0.3, 0.1]) {
      const b = bootstrapMean(new Array<number>(37).fill(d), 300, 1);
      expect(b.ci).toEqual([d, d]);
    }
  });

  it('reproduces from the same seed and differs for another', () => {
    const next = normals(9);
    const d = Array.from({ length: 60 }, next);
    expect(bootstrapMean(d, 400, 5)).toEqual(bootstrapMean(d, 400, 5));
    expect(bootstrapMean(d, 400, 5).ci).not.toEqual(bootstrapMean(d, 400, 6).ci);
  });

  it('covers a known mean on synthetic normal data', () => {
    let covered = 0;
    const reps = 40;
    for (let r = 0; r < reps; r++) {
      const next = normals(100 + r);
      const d = Array.from({ length: 120 }, () => 3 + next());
      const { ci } = bootstrapMean(d, 600, 77);
      covered += ci[0] <= 3 && ci[1] >= 3 ? 1 : 0;
    }
    // Nominal 95% (38 of 40); the bound leaves room for sampling noise.
    expect(covered).toBeGreaterThanOrEqual(33);
  });

  it('puts p well above 0 for a centred sample and at 0 for a shifted one', () => {
    const next = normals(4);
    const d = Array.from({ length: 100 }, next);
    expect(bootstrapMean(d, 800, 3).p).toBeGreaterThan(0.05);
    expect(
      bootstrapMean(
        d.map((x) => x + 3),
        800,
        3,
      ).p,
    ).toBe(0);
  });
});

describe('pairRuns', () => {
  it('pairs by (lineup, seed) and drops unmatched runs', () => {
    const runs = [
      run('base', 0, 2, {}),
      run('cand', 0, 2, {}),
      run('base', 0, 1, {}),
      run('cand', 1, 1, {}),
      run('base', 1, 1, {}),
      run('cand', 0, 9, {}),
    ];
    const pairs = pairRuns(runs);
    expect(pairs.map((p) => [p.lineup, p.seed])).toEqual([
      [0, 2],
      [1, 1],
    ]);
    expect(pairs[1]?.base.side).toBe('base');
    expect(pairs[1]?.cand.side).toBe('cand');
  });

  it('reports dropped runs and the pair count in the header', () => {
    const data = buildReport(
      makeInput({
        pairs: 5,
        series: { x: (i) => [i, i] },
        metrics: [metric('x', [])],
        extraRuns: [run('base', 0, 99, { x: 1 })],
      }),
    );
    expect(data.header.pairs).toBe(5);
    expect(data.header.warnings.some((w) => w.includes('dropped'))).toBe(true);
  });

  it('drops pairs where a skip series is missing on one side, and counts it as 0 for zero series', () => {
    const base = [run('base', 0, 1, { s: 1, z: 1 }), run('base', 0, 2, { s: 2, z: 2 })];
    const cand = [run('cand', 0, 1, { s: 5, z: 5 }), run('cand', 0, 2, { z: 3 })];
    const input = {
      ...makeInput({ pairs: 0, series: {}, metrics: [metric('s', [], 'skip'), metric('z', [], 'zero')] }),
      runs: [...base, ...cand],
    };
    const data = buildReport(input);
    const byName = new Map(data.series.map((s) => [s.name, s]));
    expect(byName.get('s')?.n).toBe(1);
    expect(byName.get('s')?.meanDiff).toBe(4);
    expect(byName.get('z')?.n).toBe(2);
    expect(byName.get('z')?.meanCand).toBe(4);
  });
});

describe('benjaminiHochberg', () => {
  it('rejects up to the largest k with p(k) <= q k / m', () => {
    expect(benjaminiHochberg([0.04, 0.5, 0.01, 0.03], 0.1)).toEqual([true, false, true, true]);
  });

  it('rejects nothing when nothing is small, everything when all are', () => {
    expect(benjaminiHochberg([0.6, 0.7, 0.9], 0.1)).toEqual([false, false, false]);
    expect(benjaminiHochberg([0, 0, 0], 0.1)).toEqual([true, true, true]);
    expect(benjaminiHochberg([], 0.1)).toEqual([]);
  });
});

describe('tagMatches', () => {
  it('matches by dot-segment prefix in either direction', () => {
    expect(tagMatches('gunner.heat.band', 'gunner.heat')).toBe(true);
    expect(tagMatches('gunner', 'gunner.heat')).toBe(true);
    expect(tagMatches('gunner.heat', 'gunner.heat')).toBe(true);
    expect(tagMatches('gunner.heat', 'gun')).toBe(false);
    expect(tagMatches('gunnerx', 'gunner')).toBe(false);
    expect(tagMatches('team.ff', 'gunner.heat')).toBe(false);
  });
});

const METRICS = [
  metric('gunner.heat.band', ['gunner.heat']),
  metric('team.ff', ['team.ff']),
  metric('quiet', ['misc']),
  metric('tiny', ['misc']),
];

function synthetic(tags: string[]): ReturnType<typeof buildReport> {
  const noise = normals(21);
  const noise2 = normals(22);
  return buildReport(
    makeInput({
      pairs: 80,
      tags,
      metrics: METRICS,
      series: {
        'gunner.heat.band[b85]': () => {
          const a = 10 + noise();
          return [a, a + 3];
        },
        'team.ff[a>b]': () => {
          const a = 5 + noise();
          return [a, a + 2];
        },
        quiet: () => [10 + noise2(), 10 + noise2()],
        // A tiny but certain change (+0.1%): significant statistically, below the 2% floor.
        tiny: () => {
          const a = 1000 + noise();
          return [a, a + 1];
        },
      },
    }),
  );
}

describe('buildReport', () => {
  it('ranks movers by effect size and hides noise and sub-floor changes', () => {
    const data = synthetic(['gunner.heat']);
    expect(new Set(data.movers)).toEqual(new Set(['gunner.heat.band[b85]', 'team.ff[a>b]']));
    const quiet = data.series.find((s) => s.name === 'quiet');
    const tiny = data.series.find((s) => s.name === 'tiny');
    expect(quiet?.significant).toBe(false);
    expect(tiny?.significant).toBe(false);
    const effects = data.series.map((s) => s.effect);
    expect(effects).toEqual([...effects].sort((a, b) => b - a));
    expect(data.header.seriesTested).toBe(4);
  });

  it('gives effect size 0 when the baseline has no spread', () => {
    const data = buildReport(makeInput({ pairs: 20, metrics: [metric('c', [])], series: { c: () => [0.29, 0.22] } }));
    expect(data.series[0]?.effect).toBe(0);
    expect(data.series[0]?.significant).toBe(true);
  });

  it('computes d = cand - base, relative change and mean values', () => {
    const data = synthetic([]);
    const s = data.series.find((x) => x.name === 'team.ff[a>b]');
    expect(s?.meanDiff).toBeCloseTo(2, 9);
    expect(s?.meanCand).toBeCloseTo((s?.meanBase ?? 0) + 2, 9);
    expect(s?.rel).toBeCloseTo(2 / (s?.meanBase ?? 1), 9);
    expect(s?.ci[0]).toBeCloseTo(2, 9);
    expect(s?.ci[1]).toBeCloseTo(2, 9);
  });

  it('flags a significant series outside the tags, and only then', () => {
    const data = synthetic(['gunner.heat']);
    const heat = data.series.find((s) => s.name === 'gunner.heat.band[b85]');
    const ff = data.series.find((s) => s.name === 'team.ff[a>b]');
    expect(heat).toMatchObject({ inTag: true, outside: false });
    expect(ff).toMatchObject({ inTag: false, outside: true });
    expect(data.outside).toEqual(['team.ff[a>b]']);
    expect(synthetic([]).outside).toEqual([]);
  });

  it('warns on an unknown tag and lists the known areas', () => {
    const data = synthetic(['nope.x']);
    const w = data.header.warnings.find((x) => x.includes('nope.x'));
    expect(w).toContain('gunner.heat');
    expect(w).toContain('team.ff');
  });

  it('builds 12-bin histograms over the shared range', () => {
    const s = synthetic([]).series.find((x) => x.name === 'team.ff[a>b]');
    const h = s?.histogram;
    expect(h?.base).toHaveLength(12);
    expect(h?.cand).toHaveLength(12);
    expect(h?.base.reduce((a, b) => a + b, 0)).toBe(80);
    expect(h?.cand.reduce((a, b) => a + b, 0)).toBe(80);
    expect(h?.lo).toBeLessThan(h?.hi ?? 0);
  });

  it('builds the choice-spread table and flags a tax above 90%', () => {
    const data = buildReport(
      makeInput({
        pairs: 10,
        metrics: [metric('choice.spread', ['gunner.choice'])],
        series: {
          'choice.spread[gunner:stance:brace]': () => [0.71, 0.95],
          'choice.spread[gunner:stance:mobile]': () => [0.29, 0.05],
          'choice.spread[gunner:aim:near]': () => [0.5, 0.5],
          'choice.spread[gunner:aim:far]': () => [0.5, 0.5],
        },
      }),
    );
    const stance = data.choiceSpread.find((r) => r.decision === 'stance');
    const aim = data.choiceSpread.find((r) => r.decision === 'aim');
    expect(stance?.tax).toBe(true);
    expect(stance?.options.find((o) => o.option === 'brace')).toMatchObject({ base: 0.71, cand: 0.95 });
    expect(aim?.tax).toBe(false);
  });

  it('is deterministic: report.json bytes are stable', () => {
    expect(reportJson(synthetic(['gunner.heat']))).toBe(reportJson(synthetic(['gunner.heat'])));
  });
});

const ev = (tick: number, def: string): SimEvent => ({ tick, kind: 'spawn', id: 1, def, team: 1 });
const hash = (tick: number, h: string): SimEvent => ({ tick, kind: 'hash', stateHash: h });

describe('divergence', () => {
  it('finds the first tick where non-hash events differ, ignoring hashes', () => {
    const a = logOf([ev(1, 'x'), hash(30, 'aa'), ev(40, 'y'), ev(50, 'z')]);
    const b = logOf([ev(1, 'x'), hash(30, 'bb'), ev(40, 'y'), ev(55, 'z')]);
    expect(firstDivergence(a, b)).toBe(50);
  });

  it('is null for logs that differ only in hashes, and the first extra event for a prefix', () => {
    expect(firstDivergence(logOf([ev(1, 'x'), hash(30, 'a')]), logOf([ev(1, 'x'), hash(30, 'b')]))).toBeNull();
    expect(firstDivergence(logOf([ev(1, 'x')]), logOf([ev(1, 'x'), ev(7, 'y')]))).toBe(7);
  });

  it('picks the pair with the largest difference in the direction of the mean', () => {
    const logs = new Map<string, ReturnType<typeof logOf>>();
    const input = makeInput({
      pairs: 12,
      metrics: [metric('m', ['m'])],
      // pair i: d = 3 + i, except pair 3 (seed 4) whose d is -15: the largest |d|, but against the mean.
      series: { m: (i) => [10, i === 3 ? -5 : 13 + i] },
      loadLog: (r) => logs.get(r.logPath) ?? logOf([]),
    });
    for (const r of input.runs) {
      const diverging = r.seed === 12;
      logs.set(r.logPath, logOf([ev(1, 'x'), ev(r.side === 'cand' && diverging ? 20 : 90, 'y')]));
    }
    const data = buildReport(input);
    const m = data.series.find((s) => s.name === 'm');
    expect(m?.significant).toBe(true);
    expect(m?.divergence).toMatchObject({ series: 'm', lineup: 0, seed: 12, tick: 20 });
    expect(m?.divergence?.baseLog).toContain('base');
    expect(m?.divergence?.candLog).toContain('cand');
  });
});
