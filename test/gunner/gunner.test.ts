import { describe, expect, it } from 'vitest';
import { gunnerDef } from '../../src/content/heroes/gunner.ts';
import { STANCE } from '../../src/sim/heroes/gunner.ts';
import { ticks } from '../../src/sim/time.ts';
import { dmgFrom, fastHeat, GUNNER, gunnerRig, heatBands } from './rig.ts';

const OVERHEAT = ticks(4);

describe('firing cadence', () => {
  it('fires exactly every ticks(period) at constant rate', () => {
    const r = gunnerRig(fastHeat({ heat: { ...gunnerDef().heat, perShot: 0 } }));
    r.dummy(5, 0);
    const hits = dmgFrom(r.step(60));
    expect(hits.length).toBeGreaterThan(5);
    const gaps = hits.slice(1).map((h, i) => h.tick - (hits[i]?.tick ?? 0));
    expect(new Set(gaps)).toEqual(new Set([ticks(gunnerDef().attack.cooldown)]));
  });

  it('respects hold fire and ignores targets out of range', () => {
    const r = gunnerRig();
    r.dummy(30, 0);
    expect(dmgFrom(r.step(30))).toEqual([]);
    r.dummy(5, 0);
    r.sim.command(0, { kind: 'hold', hero: GUNNER, on: true });
    expect(dmgFrom(r.step(30))).toEqual([]);
    r.sim.command(0, { kind: 'hold', hero: GUNNER, on: false });
    expect(dmgFrom(r.step(30)).length).toBeGreaterThan(0);
  });
});

describe('spin-up', () => {
  it('ramps the fire rate from 40% to 160% over 3 s of continuous fire', () => {
    const r = gunnerRig();
    r.dummy(5, 0);
    const first = dmgFrom(r.step(30)).length;
    expect(r.kit.spin).toBeCloseTo(1 / 3, 5);
    r.step(60);
    expect(r.kit.spin).toBeCloseTo(1, 5);
    const later = dmgFrom(r.step(30)).length;
    // 6 ticks / 0.4 = 15 ticks per shot at the start, 6 / 1.6 = 3.75 at the top.
    expect(first).toBeLessThanOrEqual(3);
    expect(later).toBeGreaterThanOrEqual(7);
  });

  it('drains over 1 s while moving, and over 2 s when idle with no target', () => {
    const r = gunnerRig();
    r.dummy(5, 0);
    r.step(90);
    expect(r.kit.spin).toBeCloseTo(1, 5);
    r.sim.command(0, { kind: 'move', hero: GUNNER, x: 0, y: -50 });
    r.step(15);
    expect(r.kit.spin).toBeCloseTo(0.5, 5);
    r.step(15);
    expect(r.kit.spin).toBeCloseTo(0, 5);

    const r2 = gunnerRig();
    const d2 = r2.dummy(5, 0);
    r2.step(90);
    r2.sim.entities.remove(d2.id);
    r2.step(30);
    expect(r2.kit.spin).toBeCloseTo(0.5, 5);
  });
});

describe('heat bands', () => {
  it('emits resource events on band crossings in both directions', () => {
    const r = gunnerRig(fastHeat());
    r.dummy(5, 0);
    r.step(60);
    r.step(OVERHEAT + 1);
    expect(heatBands(r.events).slice(0, 6)).toEqual([60, 85, 100, 85, 60, 0]);
    expect(r.events.filter((e) => e.kind === 'resource').every((e) => e.kind === 'resource' && e.hero === GUNNER)).toBe(
      true,
    );
  });

  it('decays only when not engaged', () => {
    const r = gunnerRig(fastHeat());
    const d = r.dummy(5, 0);
    r.step(25); // 5 shots
    const hot = r.kit.heat;
    expect(hot).toBeGreaterThan(0.4);
    r.sim.entities.remove(d.id);
    r.step(30);
    expect(r.kit.heat).toBeCloseTo(hot - 0.1, 5);
  });

  it('gives rounds the pierce tag above 60% heat', () => {
    const r = gunnerRig(fastHeat());
    r.dummy(5, 0, 5);
    const hits = dmgFrom(r.step(60));
    // Heat before shot n is 0.1 * (n - 1).
    expect(hits.slice(0, 5).map((h) => [h.amount, h.tags.length])).toEqual(new Array(5).fill([3, 0]));
    for (const h of hits.slice(7, 9)) {
      expect(h.tags).toEqual(['pierce']);
      expect(h.amount).toBe(8);
    }
  });
});

describe('overpenetration', () => {
  it('hits a line above 85% heat: enemies and an ally (ff), never the shooter', () => {
    const r = gunnerRig(fastHeat());
    const front = r.dummy(5, 0);
    const back = r.dummy(9, 0);
    const side = r.dummy(5, 3);
    const friend = r.ally(7, 0);
    const offLine = r.ally(7, 3);
    const hits = dmgFrom(r.step(60));
    const volley = hits.filter((h) => h.tags.includes('overpen'));
    expect(volley.length).toBe(3);
    expect(new Set(volley.map((h) => h.dst))).toEqual(new Set([front.id, back.id, friend.id]));
    for (const h of volley) {
      expect(h.tags).toEqual(['ff', 'line', 'overpen', 'pierce']);
    }
    expect(hits.some((h) => h.dst === GUNNER || h.dst === side.id || h.dst === offLine.id)).toBe(false);
    // Before the line, shots only hit the target.
    expect(hits.slice(0, 8).every((h) => h.dst === front.id)).toBe(true);
    expect(r.sim.entities.get(friend.id)?.hp).toBeLessThan(1_000_000);
  });
});

describe('overheat', () => {
  it('locks out fire for exactly 4 s, then resumes', () => {
    const r = gunnerRig(fastHeat());
    r.dummy(5, 0);
    const first = r.step(60);
    const hits = dmgFrom(first);
    const last = hits.at(-1)?.tick ?? 0;
    expect(heatBands(first)).toContain(100);
    expect(r.kit.lockTicks).toBeGreaterThan(0);
    expect(dmgFrom(r.step(last + OVERHEAT - 60))).toEqual([]);
    expect(r.kit.heat).toBe(0);
    expect(r.kit.spin).toBe(0);
    expect(dmgFrom(r.step(1))[0]?.tick).toBe(last + OVERHEAT + 1);
  });
});

describe('Brace', () => {
  it('adds range, roots, stops a move in progress, and fixes a 90 degree arc', () => {
    const r = gunnerRig();
    r.dummy(14, 0); // beyond 12, within 15.6
    expect(dmgFrom(r.step(20))).toEqual([]);
    r.sim.command(0, { kind: 'move', hero: GUNNER, x: 0, y: 40 });
    r.step(3);
    expect(r.gunner.move.mode).toBe('point');
    r.cast(0, 20, 0);
    const braced = r.step(1);
    expect(r.kit.stance).toBe(STANCE.braced);
    expect(r.gunner.move.mode).toBe('idle');
    expect(braced.some((e) => e.kind === 'status' && e.status === 'rooted' && e.on)).toBe(true);
    const { y } = r.gunner;
    r.sim.command(0, { kind: 'move', hero: GUNNER, x: 0, y: 40 });
    r.step(10);
    expect(r.gunner.y).toBe(y);
    expect(dmgFrom(r.step(20)).length).toBeGreaterThan(0);
  });

  it('only fires inside the arc centred on the facing at brace time', () => {
    const r = gunnerRig();
    r.dummy(0, 8); // 90 degrees off the facing
    r.dummy(-8, 0); // behind
    r.cast(0, 20, 0);
    const first = dmgFrom(r.step(30));
    expect(first).toEqual([]);
    const edge = r.dummy(8, 3);
    const hits = dmgFrom(r.step(30));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => h.dst === edge.id)).toBe(true);
  });

  it('keeps spin while braced and drains it when not', () => {
    const braced = gunnerRig();
    const d = braced.dummy(5, 0);
    braced.cast(0, 20, 0);
    braced.step(90);
    braced.sim.entities.remove(d.id);
    braced.step(90);
    expect(braced.kit.spin).toBeCloseTo(1, 5);

    const free = gunnerRig();
    const d2 = free.dummy(5, 0);
    free.step(90);
    free.sim.entities.remove(d2.id);
    free.step(90);
    expect(free.kit.spin).toBe(0);
  });

  it('takes 1 s to unbrace: rooted and silent, then free', () => {
    const r = gunnerRig();
    r.dummy(5, 0);
    r.cast(0, 20, 0);
    r.step(10);
    r.cast(0);
    const start = r.sim.tick + 1;
    const during = dmgFrom(r.step(ticks(1)));
    expect(during).toEqual([]);
    expect(r.kit.stance).toBe(STANCE.free);
    r.sim.command(0, { kind: 'move', hero: GUNNER, x: 0, y: 40 }, start + ticks(1) + 1);
    const after = r.step(2);
    expect(dmgFrom(after)[0]?.tick).toBe(start + ticks(1));
    expect(r.gunner.move.mode).toBe('point');
  });
});

describe('Vent', () => {
  it('dumps all heat as a cone whose damage scales with heat, and resets spin', () => {
    const r = gunnerRig();
    r.sim.command(0, { kind: 'hold', hero: GUNNER, on: true });
    const inCone = r.dummy(6, 1);
    const outside = r.dummy(0, 6);
    r.step(1);
    r.kit.heat = 0.5;
    r.kit.spin = 0.8;
    r.cast(1, 10, 0);
    const ev = r.step(1);
    const hits = dmgFrom(ev);
    expect(hits.map((h) => [h.dst, h.amount, h.tags])).toEqual([[inCone.id, 150, ['cone', 'ability:vent']]]);
    expect(hits.some((h) => h.dst === outside.id)).toBe(false);
    expect(r.kit.heat).toBe(0);
    expect(r.kit.spin).toBe(0);
    expect(ev.find((e) => e.kind === 'ability')).toMatchObject({ hero: GUNNER, slot: 1 });
    expect(heatBands(ev)).toEqual([]); // Heat 0.5 was already band 0.

    r.kit.heat = 0.25;
    r.cast(1, 10, 0);
    expect(dmgFrom(r.step(1))).toEqual([]); // On cooldown.
    r.step(ticks(12));
    r.kit.heat = 0.25;
    r.cast(1, 10, 0);
    expect(dmgFrom(r.step(1))[0]?.amount).toBe(75);
  });

  it('emits the band drop when dumping a hot gunner', () => {
    const r = gunnerRig(fastHeat());
    r.dummy(5, 0);
    r.step(50);
    expect(r.kit.heatBand).toBe(85);
    r.cast(1, 10, 0);
    expect(heatBands(r.step(1))).toEqual([0]);
  });
});

describe('Suppressing Fire', () => {
  it('hits a wide cone for low damage, applies Suppressed, costs heat and has a cooldown', () => {
    const r = gunnerRig();
    r.sim.command(0, { kind: 'hold', hero: GUNNER, on: true });
    const a = r.dummy(6, 3); // ~27 degrees
    const b = r.dummy(6, -4); // ~34 degrees, inside the 100 degree cone
    const out = r.dummy(-5, 0);
    r.step(1);
    r.cast(2, 10, 0);
    const ev = r.step(1);
    const hits = dmgFrom(ev);
    expect(hits.map((h) => h.dst)).toEqual([a.id, b.id]);
    expect(hits.every((h) => h.amount === 12 && h.tags.includes('cone'))).toBe(true);
    for (const id of [a.id, b.id]) {
      expect(r.sim.entities.get(id)?.statuses).toMatchObject([{ status: 'suppressed', src: GUNNER, value: 0.4 }]);
    }
    expect(r.sim.entities.get(out.id)?.statuses).toEqual([]);
    expect(r.kit.heat).toBeCloseTo(0.1 - 0.1 / 30, 9);
    r.cast(2, 10, 0);
    expect(dmgFrom(r.step(1))).toEqual([]);
    expect(r.kit.cdSuppress).toBe(ticks(10) - 2);
  });
});

describe('Furnace Heart', () => {
  it('gives 6 s of no overheat and full overpenetration, then a forced 6 s vent', () => {
    const r = gunnerRig(fastHeat());
    const target = r.dummy(5, 0);
    const friend = r.ally(8, 0);
    r.cast(3);
    const hits = dmgFrom(r.step(ticks(6) + ticks(6) + 5));
    const lastActive = ticks(6);
    const active = hits.filter((h) => h.tick <= lastActive);
    expect(active.length).toBeGreaterThanOrEqual(30);
    expect(active.every((h) => h.tags.includes('overpen') && h.tags.includes('ff') && h.tags.includes('pierce'))).toBe(
      true,
    );
    expect(active.some((h) => h.dst === friend.id)).toBe(true);
    expect(active.some((h) => h.dst === target.id)).toBe(true);
    expect(r.events.some((e) => e.kind === 'ability' && e.slot === 3)).toBe(true);
    // Heat never triggered an overheat lock during the window: no gap in fire.
    expect(active.at(-1)?.tick).toBeGreaterThan(lastActive - 7);
    // Forced vent: no fire for exactly 6 s after the window, then fire resumes.
    const after = hits.filter((h) => h.tick > lastActive);
    expect(after[0]?.tick).toBe(lastActive + ticks(6) + 1);
    // And it cannot be recast during its cooldown.
    expect(r.kit.cdFurnace).toBeGreaterThan(0);
  });
});
