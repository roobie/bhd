import { describe, expect, it } from 'vitest';
import { defaultGame } from '../../src/content/index.ts';
import { Sim } from '../../src/sim/sim.ts';
import { applyStatus, effectiveSpeed, hasStatus, removeStatus, statusValue } from '../../src/sim/statuses.ts';
import { rig } from './rig.ts';

describe('applyStatus', () => {
  it('applies, reports has/value, emits status on once', () => {
    const { events, ctx, add } = rig();
    const foe = add();
    applyStatus(ctx, foe.id, { status: 'suppressed', src: 2, durationTicks: 90, value: 0.4 });
    expect(foe.statuses).toEqual([{ status: 'suppressed', until: 100, src: 2, value: 0.4 }]);
    expect(hasStatus(foe, 'suppressed')).toBe(true);
    expect(hasStatus(foe, 'marked')).toBe(false);
    expect(statusValue(foe, 'suppressed')).toBe(0.4);
    expect(statusValue(foe, 'marked')).toBe(0);
    expect(events).toEqual([{ tick: 10, kind: 'status', dst: foe.id, status: 'suppressed', on: true, src: 2 }]);
  });

  it('refresh from the same src: until and value are the max, no second on event', () => {
    const { events, ctx, add } = rig();
    const foe = add();
    applyStatus(ctx, foe.id, { status: 'exposed', src: 2, durationTicks: 60, value: 5 });
    applyStatus(ctx, foe.id, { status: 'exposed', src: 2, durationTicks: 30, value: 3 });
    expect(foe.statuses).toEqual([{ status: 'exposed', until: 70, src: 2, value: 5 }]);
    applyStatus(ctx, foe.id, { status: 'exposed', src: 2, durationTicks: 90, value: 7 });
    expect(foe.statuses).toEqual([{ status: 'exposed', until: 100, src: 2, value: 7 }]);
    expect(events).toHaveLength(1);
  });

  it('keeps one instance per (status, src), sorted by status then src; value reads the max', () => {
    const { ctx, add } = rig();
    const foe = add();
    applyStatus(ctx, foe.id, { status: 'marked', src: 5, durationTicks: 10, value: 1 });
    applyStatus(ctx, foe.id, { status: 'exposed', src: 4, durationTicks: 10, value: 1 });
    applyStatus(ctx, foe.id, { status: 'marked', src: 2, durationTicks: 10, value: 3 });
    expect(foe.statuses.map((s) => [s.status, s.src])).toEqual([
      ['exposed', 4],
      ['marked', 2],
      ['marked', 5],
    ]);
    expect(statusValue(foe, 'marked')).toBe(3);
  });

  it('ignores dead or missing targets and durations under one tick', () => {
    const { events, ctx, add } = rig();
    const foe = add();
    applyStatus(ctx, 999, { status: 'marked', src: 2, durationTicks: 10, value: 1 });
    applyStatus(ctx, foe.id, { status: 'marked', src: 2, durationTicks: 0, value: 1 });
    applyStatus(ctx, foe.id, { status: 'marked', src: 2, durationTicks: Number.NaN, value: 1 });
    foe.hp = 0;
    applyStatus(ctx, foe.id, { status: 'marked', src: 2, durationTicks: 10, value: 1 });
    expect(foe.statuses).toEqual([]);
    expect(events).toEqual([]);
  });
});

describe('removeStatus', () => {
  it('removes all instances, or only those from src, emitting off for each', () => {
    const { events, ctx, add } = rig();
    const foe = add();
    applyStatus(ctx, foe.id, { status: 'taunted', src: 2, durationTicks: 90, value: 0 });
    applyStatus(ctx, foe.id, { status: 'taunted', src: 3, durationTicks: 90, value: 0 });
    events.length = 0;
    removeStatus(ctx, foe.id, 'taunted', 3);
    expect(foe.statuses.map((s) => s.src)).toEqual([2]);
    expect(events).toEqual([{ tick: 10, kind: 'status', dst: foe.id, status: 'taunted', on: false, src: 3 }]);
    removeStatus(ctx, foe.id, 'taunted');
    expect(foe.statuses).toEqual([]);
    removeStatus(ctx, foe.id, 'taunted');
    removeStatus(ctx, 999, 'taunted');
    expect(events).toHaveLength(2);
  });
});

describe('expiry', () => {
  it('active while tick < until, gone with the off event on tick == until', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    const hero = sim.entities.get(2);
    if (hero === undefined) {
      throw new Error('no hero');
    }
    hero.statuses.push({ status: 'marked', until: 5, src: 1, value: 0.25 });
    const offTicks: number[] = [];
    for (let t = 1; t <= 6; t++) {
      for (const e of sim.step()) {
        if (e.kind === 'status' && !e.on) {
          offTicks.push(e.tick);
        }
      }
      expect(hasStatus(hero, 'marked')).toBe(t < 5);
    }
    expect(offTicks).toEqual([5]);
  });

  it('statuses expiring on the same tick emit off in (status, src) order', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    const hero = sim.entities.get(2);
    if (hero === undefined) {
      throw new Error('no hero');
    }
    hero.statuses.push(
      { status: 'exposed', until: 2, src: 9, value: 1 },
      { status: 'marked', until: 2, src: 3, value: 1 },
      { status: 'marked', until: 2, src: 8, value: 1 },
      { status: 'suppressed', until: 50, src: 1, value: 0.1 },
    );
    sim.step();
    const offs = sim.step().flatMap((e) => (e.kind === 'status' && !e.on ? [[e.status, e.src]] : []));
    expect(offs).toEqual([
      ['exposed', 9],
      ['marked', 3],
      ['marked', 8],
    ]);
    expect(hero.statuses.map((s) => s.status)).toEqual(['suppressed']);
  });

  it('the default combo statuses last 2-4 s', () => {
    const table = defaultGame().statuses;
    for (const id of ['suppressed', 'marked', 'exposed', 'clumped', 'taunted']) {
      const secs = table.find((s) => s.id === id)?.duration ?? 0;
      expect(secs).toBeGreaterThanOrEqual(2);
      expect(secs).toBeLessThanOrEqual(4);
    }
  });
});

describe('effectiveSpeed', () => {
  it('suppressed removes a fraction of speed: 3 * (1 - 0.4) = 1.8', () => {
    const { ctx, add } = rig();
    const foe = add({ speed: 3 });
    expect(effectiveSpeed(foe)).toBe(3);
    applyStatus(ctx, foe.id, { status: 'suppressed', src: 2, durationTicks: 90, value: 0.4 });
    expect(effectiveSpeed(foe)).toBeCloseTo(1.8, 12);
  });

  it('uses the strongest suppression (no stacking) and clamps to [0, 1]', () => {
    const { ctx, add } = rig();
    const foe = add({ speed: 4 });
    applyStatus(ctx, foe.id, { status: 'suppressed', src: 2, durationTicks: 90, value: 0.25 });
    applyStatus(ctx, foe.id, { status: 'suppressed', src: 3, durationTicks: 90, value: 0.5 });
    expect(effectiveSpeed(foe)).toBe(2);
    applyStatus(ctx, foe.id, { status: 'suppressed', src: 4, durationTicks: 90, value: 7 });
    expect(effectiveSpeed(foe)).toBe(0);
  });

  it('rooted is 0 whatever else is on; taunted changes nothing', () => {
    const { ctx, add } = rig();
    const foe = add({ speed: 4 });
    applyStatus(ctx, foe.id, { status: 'taunted', src: 2, durationTicks: 90, value: 0 });
    expect(effectiveSpeed(foe)).toBe(4);
    applyStatus(ctx, foe.id, { status: 'rooted', src: 2, durationTicks: 30, value: 0 });
    applyStatus(ctx, foe.id, { status: 'suppressed', src: 2, durationTicks: 30, value: 0.1 });
    expect(effectiveSpeed(foe)).toBe(0);
  });

  it('a suppressed unit covers proportionally less ground per tick in a real sim', () => {
    const run = (value: number): number => {
      const sim = new Sim({ seed: 1, game: defaultGame() });
      const hero = sim.entities.get(2);
      if (hero === undefined) {
        throw new Error('no hero');
      }
      hero.statuses.push({ status: 'suppressed', until: 1000, src: 1, value });
      hero.move = { mode: 'point', tx: hero.x + 100, ty: hero.y, waypoint: 0 };
      const x0 = hero.x;
      sim.step();
      sim.step();
      return hero.x - x0;
    };
    const free = run(0);
    expect(free).toBeGreaterThan(0);
    expect(run(0.5)).toBeCloseTo(free * 0.5, 9);
  });
});
