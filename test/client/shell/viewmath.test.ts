// Invariants of the pure view math (D-4E4QRJ7N6LIGZDSD): frame driver, interpolation, camera,
// snapshots. No gameplay numbers.

import { describe, expect, it } from 'vitest';
import { fitCamera } from '../../../src/client/shell/camera.ts';
import { DEFAULT_FRAME_OPTIONS, newFrameClock, planFrame } from '../../../src/client/shell/frame.ts';
import { interpolate } from '../../../src/client/shell/interp.ts';
import { advanceEffects, takeSnapshot } from '../../../src/client/shell/snapshot.ts';
import type { EntitySnap, FrameOptions, Insets, Snapshot } from '../../../src/client/shell/types.ts';
import { defaultGame } from '../../../src/content/index.ts';
import { Sim } from '../../../src/sim/sim.ts';

const OPTS = DEFAULT_FRAME_OPTIONS;

describe('planFrame', () => {
  it('plans no steps on the first call', () => {
    const plan = planFrame(newFrameClock(), 5000, OPTS);
    expect(plan.steps).toBe(0);
    expect(plan.alpha).toBe(0);
    expect(plan.clock.lastMs).toBe(5000);
  });

  it('is pure', () => {
    const clock = { lastMs: 100, accMs: 7 };
    expect(planFrame(clock, 160, OPTS)).toEqual(planFrame(clock, 160, OPTS));
  });

  it('keeps alpha in [0, 1) and the remainder below a tick over random frames', () => {
    let clock = newFrameClock();
    let now = 0;
    let seed = 12_345;
    for (let i = 0; i < 2000; i++) {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      now += (seed / 2_147_483_648) * 400;
      const plan = planFrame(clock, now, OPTS);
      expect(plan.alpha).toBeGreaterThanOrEqual(0);
      expect(plan.alpha).toBeLessThan(1);
      expect(plan.steps).toBeGreaterThanOrEqual(0);
      expect(plan.steps).toBeLessThanOrEqual(OPTS.maxSteps);
      expect(plan.clock.accMs).toBeLessThan(OPTS.tickMs);
      ({ clock } = plan);
    }
  });

  it('caps catch-up steps and drops the surplus', () => {
    const plan = planFrame({ lastMs: 0, accMs: 0 }, 10_000, { ...OPTS, maxSteps: 2 });
    expect(plan.steps).toBe(2);
    expect(plan.clock.accMs).toBeLessThan(OPTS.tickMs);
  });

  it('clamps long gaps to maxGapMs', () => {
    const o = { ...OPTS, maxSteps: 1000 };
    const wide = planFrame({ lastMs: 0, accMs: 0 }, 1e9, o);
    const edge = planFrame({ lastMs: 0, accMs: 0 }, OPTS.maxGapMs, o);
    expect(wide.steps).toBe(edge.steps);
  });

  it('treats a clock that runs backwards as no time', () => {
    expect(planFrame({ lastMs: 500, accMs: 0 }, 100, OPTS).steps).toBe(0);
  });

  it('adds nothing while paused', () => {
    const plan = planFrame({ lastMs: 0, accMs: 3 }, 200, { ...OPTS, paused: true });
    expect(plan.steps).toBe(0);
    expect(plan.clock.accMs).toBe(3);
  });

  it('scales with speed', () => {
    const o: FrameOptions = { ...OPTS, maxSteps: 100 };
    const one = planFrame({ lastMs: 0, accMs: 0 }, 100, o).steps;
    const two = planFrame({ lastMs: 0, accMs: 0 }, 100, { ...o, speed: 2 }).steps;
    expect(two).toBeGreaterThanOrEqual(one * 2 - 1);
    expect(two).toBeLessThanOrEqual(one * 2 + 1);
  });
});

function snap(id: number, x: number, y: number, extra: { facing?: number; hpFrac?: number } = {}): EntitySnap {
  const { facing = 0, hpFrac = 1 } = extra;
  return { id, kind: 'enemy', def: 'grunt', team: 1, x, y, radius: 1, hpFrac, facing, statuses: [] };
}

describe('interpolate', () => {
  const prev: Snapshot = { tick: 1, entities: [snap(2, 0, 0), snap(3, 5, 5)] };
  const curr: Snapshot = { tick: 2, entities: [snap(2, 10, 4, { facing: 1, hpFrac: 0.5 }), snap(4, 7, 7)] };

  it('hits prev at alpha 0 and curr at alpha 1', () => {
    const [a] = interpolate(prev, curr, 0);
    const [b] = interpolate(prev, curr, 1);
    expect(a).toMatchObject({ x: 0, y: 0, facing: 0, hpFrac: 1 });
    expect(b).toMatchObject({ x: 10, y: 4, facing: 1, hpFrac: 0.5 });
  });

  it('lerps in between', () => {
    expect(interpolate(prev, curr, 0.5)[0]).toMatchObject({ x: 5, y: 2, hpFrac: 0.75 });
  });

  it('drops removed entities and shows spawned ones at curr', () => {
    const out = interpolate(prev, curr, 0.3);
    expect(out.map((e) => e.id)).toEqual([2, 4]);
    expect(out[1]).toEqual(curr.entities[1]);
  });

  it('returns curr as is without prev', () => {
    expect(interpolate(undefined, curr, 0.5)).toBe(curr.entities);
  });

  it('turns facing by the shortest arc', () => {
    const p: Snapshot = { tick: 0, entities: [snap(1, 0, 0, { facing: Math.PI - 0.1 })] };
    const c: Snapshot = { tick: 1, entities: [snap(1, 0, 0, { facing: -Math.PI + 0.1 })] };
    const mid = interpolate(p, c, 0.5)[0]?.facing ?? 0;
    expect(Math.abs(Math.cos(mid) + 1)).toBeLessThan(0.01);
  });
});

const map = { width: 100, height: 50, lane: [], ancient: { x: 0, y: 0 }, heroSpawns: [] } as never;
const NONE: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

describe('fitCamera', () => {
  const cases: [string, { width: number; height: number }, Insets][] = [
    ['landscape', { width: 844, height: 390 }, NONE],
    ['portrait', { width: 390, height: 844 }, NONE],
    ['portrait with insets', { width: 390, height: 844 }, { top: 40, right: 8, bottom: 260, left: 12 }],
    ['landscape with insets', { width: 1280, height: 720 }, { top: 10, right: 200, bottom: 120, left: 240 }],
    ['square', { width: 500, height: 500 }, NONE],
  ];

  for (const [name, vp, ins] of cases) {
    it(`round-trips points and fits the free rectangle: ${name}`, () => {
      const cam = fitCamera(map, vp, ins);
      const eps = 1e-6;
      for (const p of [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
        { x: 100, y: 0 },
        { x: 0, y: 50 },
        { x: 37.5, y: 12.25 },
        { x: -20, y: 90 },
      ]) {
        const back = cam.screenToWorld(cam.worldToScreen(p));
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      }
      for (const c of [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 50 },
        { x: 100, y: 50 },
      ]) {
        const s = cam.worldToScreen(c);
        expect(s.x).toBeGreaterThanOrEqual(ins.left - eps);
        expect(s.x).toBeLessThanOrEqual(vp.width - ins.right + eps);
        expect(s.y).toBeGreaterThanOrEqual(ins.top - eps);
        expect(s.y).toBeLessThanOrEqual(vp.height - ins.bottom + eps);
      }
    });
  }

  it('rotates exactly when the free rectangle is portrait', () => {
    expect(fitCamera(map, { width: 390, height: 844 }, NONE).rotated).toBe(true);
    expect(fitCamera(map, { width: 844, height: 390 }, NONE).rotated).toBe(false);
    // Portrait viewport, but the insets leave a landscape free rectangle.
    expect(fitCamera(map, { width: 390, height: 844 }, { ...NONE, bottom: 600 }).rotated).toBe(false);
  });

  it('uses more scale when rotated in portrait than an unrotated fit would', () => {
    const cam = fitCamera(map, { width: 390, height: 844 }, NONE);
    expect(cam.pxPerUnit).toBeGreaterThan(390 / 100);
  });

  it('reads west->east top->bottom when rotated, and centres the map', () => {
    const cam = fitCamera(map, { width: 390, height: 844 }, NONE);
    const west = cam.worldToScreen({ x: 0, y: 25 });
    const east = cam.worldToScreen({ x: 100, y: 25 });
    expect(east.y).toBeGreaterThan(west.y);
    const mid = cam.worldToScreen({ x: 50, y: 25 });
    expect(mid.x).toBeCloseTo(195, 6);
    expect(mid.y).toBeCloseTo(422, 6);
  });

  it('the clip matrix agrees with worldToScreen', () => {
    for (const vp of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
    ]) {
      const cam = fitCamera(map, vp, NONE);
      const m = cam.matrix;
      expect(m).toHaveLength(9);
      for (const p of [
        { x: 0, y: 0 },
        { x: 100, y: 50 },
        { x: 31, y: 7 },
      ]) {
        const s = cam.worldToScreen(p);
        const cx = (m[0] ?? 0) * p.x + (m[3] ?? 0) * p.y + (m[6] ?? 0);
        const cy = (m[1] ?? 0) * p.x + (m[4] ?? 0) * p.y + (m[7] ?? 0);
        expect(cx).toBeCloseTo((2 * s.x) / vp.width - 1, 4);
        expect(cy).toBeCloseTo(1 - (2 * s.y) / vp.height, 4);
      }
    }
  });

  it('stays finite and invertible with a degenerate free rectangle', () => {
    const cam = fitCamera(map, { width: 100, height: 100 }, { top: 60, right: 60, bottom: 60, left: 60 });
    const back = cam.screenToWorld(cam.worldToScreen({ x: 3, y: 4 }));
    expect(Number.isFinite(back.x)).toBe(true);
    expect(Number.isFinite(cam.pxPerUnit)).toBe(true);
  });
});

describe('takeSnapshot and advanceEffects', () => {
  it('lists live entities in ascending id order with sane fields', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    let prev: Snapshot | undefined;
    for (let i = 0; i < 400; i++) {
      sim.step();
      const s = takeSnapshot(sim, prev);
      expect(s.tick).toBe(sim.tick);
      const ids = s.entities.map((e) => e.id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
      for (const e of s.entities) {
        expect(e.hpFrac).toBeGreaterThanOrEqual(0);
        expect(e.hpFrac).toBeLessThanOrEqual(1);
        expect(Number.isFinite(e.facing)).toBe(true);
        expect(Number.isFinite(e.x + e.y)).toBe(true);
      }
      prev = s;
    }
  });

  it('does not perturb the sim hash', () => {
    const a = new Sim({ seed: 3, game: defaultGame() });
    const b = new Sim({ seed: 3, game: defaultGame() });
    let prev: Snapshot | undefined;
    for (let i = 0; i < 200; i++) {
      a.step();
      b.step();
      prev = takeSnapshot(a, prev);
    }
    expect(a.hash()).toBe(b.hash());
  });

  const base: Snapshot = { tick: 1, entities: [snap(2, 3, 4)] };

  it('drops finished effects and adds one per relevant known event', () => {
    const old = { kind: 'hit' as const, id: 2, x: 0, y: 0, radius: 1, startMs: 0, durationMs: 100 };
    const out = advanceEffects(
      [old],
      [
        { tick: 1, kind: 'dmg', src: 9, dst: 2, amount: 1, tags: [] },
        { tick: 1, kind: 'ability', hero: 2, slot: 0, target: 0, value: 0 },
        { tick: 1, kind: 'death', id: 2, killer: 0 },
        { tick: 1, kind: 'death', id: 77, killer: 0 },
      ],
      base,
      100,
    );
    expect(out.map((f) => f.kind)).toEqual(['hit', 'cast', 'death']);
    expect(out.every((f) => f.startMs === 100 && f.x === 3 && f.y === 4)).toBe(true);
  });

  it('keeps effects still running', () => {
    const live = { kind: 'cast' as const, id: 2, x: 0, y: 0, radius: 1, startMs: 50, durationMs: 100 };
    expect(advanceEffects([live], [], base, 149)).toEqual([live]);
    expect(advanceEffects([live], [], base, 150)).toEqual([]);
  });
});
