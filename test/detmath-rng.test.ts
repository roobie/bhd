import { describe, expect, it } from 'vitest';
import { cloneRng, createRng, deriveRng, nextFloat, nextInt, nextU32, type Rng } from '../src/detmath/index.ts';

function take(rng: Rng, n: number): number[] {
  return Array.from({ length: n }, () => nextU32(rng));
}

describe('detmath rng', () => {
  it('matches pinned known-answer vectors', () => {
    // Changing these breaks every stored replay and seed-paired report: only on purpose.
    expect(take(createRng(42), 5)).toEqual([1_127_355_821, 1_566_901_901, 1_208_499_263, 2_274_827_720, 3_299_563_854]);
    expect(take(createRng(0), 4)).toEqual([2_601_002_981, 1_920_427_687, 87_456_352, 808_215_765]);
    expect(take(deriveRng(42, 'director'), 3)).toEqual([3_967_168_624, 1_398_819_154, 4_007_461_099]);
    expect(take(deriveRng(42, 'bot:2'), 3)).toEqual([2_001_996_526, 821_070_389, 3_059_051_448]);
    expect(Array.from(createRng(42).state)).toEqual([541_279_709, 586_076_099, 4_221_883_051, 13]);
  });

  it('same seed gives the same sequence', () => {
    expect(take(createRng(123_456), 1000)).toEqual(take(createRng(123_456), 1000));
    expect(take(deriveRng(7, 'bot:0'), 1000)).toEqual(take(deriveRng(7, 'bot:0'), 1000));
  });

  it('truncates seeds mod 2^32', () => {
    expect(take(createRng(-1), 4)).toEqual(take(createRng(0xff_ff_ff_ff), 4));
  });

  it('streams differ from each other and from the base', () => {
    const seed = 99;
    const names = ['director', 'bot:0', 'bot:1', 'bot:2', 'bot:3', ''];
    const seqs = [take(createRng(seed), 8), ...names.map((n) => take(deriveRng(seed, n), 8))];
    const keys = new Set(seqs.map((s) => s.join(',')));
    expect(keys.size).toBe(seqs.length);
    expect(take(deriveRng(1, 'director'), 8)).not.toEqual(take(deriveRng(2, 'director'), 8));
  });

  it('cloneRng forks an independent copy at the same point', () => {
    const a = createRng(5);
    take(a, 10);
    const b = cloneRng(a);
    expect(b.state).not.toBe(a.state);
    expect(take(b, 50)).toEqual(take(a, 50));
  });

  it('nextU32 stays in [0, 2^32)', () => {
    const rng = createRng(1);
    for (let i = 0; i < 10_000; i++) {
      const x = nextU32(rng);
      expect(Number.isInteger(x) && x >= 0 && x < 2 ** 32).toBe(true);
    }
  });

  it('nextFloat stays in [0, 1) with a sane mean', () => {
    const rng = createRng(2);
    let sum = 0;
    const n = 100_000;
    for (let i = 0; i < n; i++) {
      const f = nextFloat(rng);
      expect(f >= 0 && f < 1).toBe(true);
      sum += f;
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.01);
  });

  it('nextInt is in bounds and roughly uniform', () => {
    const rng = createRng(3);
    const n = 7;
    const draws = 70_000;
    const counts = new Array<number>(n).fill(0);
    for (let i = 0; i < draws; i++) {
      const x = nextInt(rng, n);
      expect(Number.isInteger(x) && x >= 0 && x < n).toBe(true);
      counts[x] = (counts[x] ?? 0) + 1;
    }
    // Chi-squared, 6 dof: p = 0.001 critical value is 22.46.
    const expected = draws / n;
    const chi2 = counts.reduce((acc, c) => acc + (c - expected) ** 2 / expected, 0);
    expect(chi2).toBeLessThan(22.46);
  });

  it('nextInt handles the edges', () => {
    const rng = createRng(4);
    expect(nextInt(rng, 1)).toBe(0);
    const big = nextInt(rng, 2 ** 32);
    expect(big >= 0 && big < 2 ** 32).toBe(true);
    // Worst-case rejection rate (~50%) still terminates and stays in range.
    for (let i = 0; i < 1000; i++) {
      expect(nextInt(rng, 2 ** 31 + 1)).toBeLessThanOrEqual(2 ** 31);
    }
    for (const bad of [0, -1, 1.5, 2 ** 32 + 1, Number.NaN]) {
      expect(() => nextInt(rng, bad)).toThrow(RangeError);
    }
  });
});
