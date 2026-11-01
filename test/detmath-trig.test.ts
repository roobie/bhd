import { describe, expect, it } from 'vitest';
import { angleDiff, atan2, cos, hypot, PI, sin, TAU, wrapAngle } from '../src/detmath/index.ts';

// Bounds stated in src/detmath/index.ts. Math.* (≤ 1 ulp itself) is the reference.
const SIN_COS_BOUND = 2 ** -51;
const ATAN2_BOUND = 2 ** -50;

function maxErr(f: (a: number) => number, ref: (a: number) => number, xs: Iterable<number>): number {
  let worst = 0;
  for (const x of xs) {
    worst = Math.max(worst, Math.abs(f(x) - ref(x)));
  }
  return worst;
}

function* sweep(from: number, to: number, steps: number): Generator<number> {
  for (let i = 0; i <= steps; i++) {
    yield from + ((to - from) * i) / steps;
  }
}

const EDGES = [0, PI / 6, PI / 4, PI / 2, PI, -PI, (3 * PI) / 2, TAU, -TAU, 1e-300, 5e-324, 1, -1, 100, 1e3, 1e5, 1e6];

describe('detmath sin/cos', () => {
  it('match Math within bound over a dense sweep', () => {
    expect(maxErr(sin, Math.sin, sweep(-10 * TAU, 10 * TAU, 200_000))).toBeLessThanOrEqual(SIN_COS_BOUND);
    expect(maxErr(cos, Math.cos, sweep(-10 * TAU, 10 * TAU, 200_000))).toBeLessThanOrEqual(SIN_COS_BOUND);
  });

  it('match Math within bound for large angles up to 1e6', () => {
    expect(maxErr(sin, Math.sin, sweep(-1e6, 1e6, 100_003))).toBeLessThanOrEqual(SIN_COS_BOUND);
    expect(maxErr(cos, Math.cos, sweep(-1e6, 1e6, 100_003))).toBeLessThanOrEqual(SIN_COS_BOUND);
  });

  it('match Math at edge cases', () => {
    expect(maxErr(sin, Math.sin, EDGES)).toBeLessThanOrEqual(SIN_COS_BOUND);
    expect(maxErr(cos, Math.cos, EDGES)).toBeLessThanOrEqual(SIN_COS_BOUND);
    expect(sin(0)).toBe(0);
    expect(Object.is(sin(-0), -0)).toBe(true);
    expect(cos(0)).toBe(1);
    expect(sin(5e-324)).toBe(5e-324);
  });

  it('stay finite and in [-1, 1] for huge angles', () => {
    for (const a of [1e9, -1e12, 1e15, 1e300, -1e300]) {
      for (const v of [sin(a), cos(a)]) {
        expect(Number.isFinite(v) && v >= -1 && v <= 1).toBe(true);
      }
    }
  });

  it('return NaN for non-finite input', () => {
    for (const a of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(sin(a)).toBeNaN();
      expect(cos(a)).toBeNaN();
    }
  });
});

describe('detmath atan2', () => {
  it('matches Math within bound over all quadrants and magnitudes', () => {
    let worst = 0;
    for (let i = 0; i <= 50_000; i++) {
      const t = -PI + (TAU * i) / 50_000;
      const r = 2 ** ((i % 81) - 40);
      const y = r * Math.sin(t);
      const x = r * Math.cos(t);
      worst = Math.max(worst, Math.abs(atan2(y, x) - Math.atan2(y, x)));
    }
    expect(worst).toBeLessThanOrEqual(ATAN2_BOUND);
  });

  it('matches Math exactly on axes, zeros and infinities', () => {
    const vals = [0, -0, 1, -1, 3.5, -3.5, 1e-310, 1e300, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const y of vals) {
      for (const x of vals) {
        const got = atan2(y, x);
        const want = Math.atan2(y, x);
        expect(Math.abs(got - want)).toBeLessThanOrEqual(ATAN2_BOUND);
        expect(Object.is(got, -0)).toBe(Object.is(want, -0));
      }
    }
  });

  it('returns NaN when either input is NaN', () => {
    expect(atan2(Number.NaN, 1)).toBeNaN();
    expect(atan2(1, Number.NaN)).toBeNaN();
  });

  it('inverts sin/cos', () => {
    let worst = 0;
    for (const a of sweep(-PI + 1e-9, PI, 10_000)) {
      worst = Math.max(worst, Math.abs(atan2(sin(a), cos(a)) - a));
    }
    expect(worst).toBeLessThan(1e-15);
  });
});

describe('detmath hypot and angles', () => {
  it('hypot equals sqrt(x²+y²) exactly', () => {
    for (const [x, y] of [
      [3, 4],
      [0, 0],
      [-5, 12],
      [1e-3, 2e-3],
      [123.456, -789.012],
      [1e6, 1e6],
    ] as const) {
      expect(hypot(x, y)).toBe(Math.sqrt(x * x + y * y));
    }
    expect(hypot(3, 4)).toBe(5);
  });

  it('hypot is within 2 ulp of Math.hypot in game ranges', () => {
    for (let i = 0; i < 10_000; i++) {
      const x = (i % 101) * 13.37 - 600;
      const y = (i % 97) * 7.77 - 300;
      const h = Math.hypot(x, y);
      expect(Math.abs(hypot(x, y) - h)).toBeLessThanOrEqual(h * 2 ** -51);
    }
  });

  it('wrapAngle maps into [-π, π) preserving direction', () => {
    for (const a of sweep(-50, 50, 10_001)) {
      const w = wrapAngle(a);
      expect(w >= -PI && w < PI).toBe(true);
      expect(Math.abs(sin(w) - sin(a))).toBeLessThan(1e-12);
      expect(Math.abs(cos(w) - cos(a))).toBeLessThan(1e-12);
    }
    expect(wrapAngle(PI)).toBe(-PI);
  });

  it('angleDiff takes the short way round', () => {
    expect(angleDiff(PI - 0.1, -PI + 0.1)).toBeCloseTo(0.2, 12);
    expect(angleDiff(0.1, -0.1)).toBeCloseTo(-0.2, 12);
  });
});
