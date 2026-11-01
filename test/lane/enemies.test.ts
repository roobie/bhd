import { describe, expect, it } from 'vitest';
import { defaultGame } from '../../src/content/index.ts';
import { findById } from '../../src/content/types.ts';
import { AGGRO_RANGE, LEASH_RANGE } from '../../src/sim/enemies.ts';
import { ticks } from '../../src/sim/time.ts';
import { firstEnemy, heldSim, oneWave, place, RANGED, SUPPORT, stepUntil, TANK, unit } from './rig.ts';

const FAR_Y = 40;

describe('aggro', () => {
  it('walks the lane when no hero is near', () => {
    const sim = heldSim(oneWave('grunt', 1));
    const e = firstEnemy(sim);
    const x0 = e.x;
    for (let i = 0; i < 20; i++) {
      sim.step();
    }
    expect(e.attack.target).toBe(0);
    expect(e.move.mode).toBe('lane');
    expect(e.x).toBeCloseTo(x0 + 2, 9);
  });

  it('targets the nearest hero in aggro range and chases it', () => {
    const sim = heldSim(oneWave('grunt', 1));
    const e = firstEnemy(sim);
    place(sim, TANK, e.x + AGGRO_RANGE - 1, 0);
    place(sim, RANGED, e.x + 3, 0);
    place(sim, SUPPORT, e.x - AGGRO_RANGE - 1, 0);
    sim.step();
    expect(e.attack.target).toBe(RANGED);
    expect(e.move.mode).toBe('point');
    expect(e.move).toMatchObject({ tx: unit(sim, RANGED).x, ty: 0 });
  });

  it('ignores heroes beyond aggro range', () => {
    const sim = heldSim(oneWave('grunt', 1));
    const e = firstEnemy(sim);
    place(sim, TANK, e.x, AGGRO_RANGE + 2);
    sim.step();
    expect(e.attack.target).toBe(0);
  });

  it('breaks distance ties toward the lower id', () => {
    const sim = heldSim(oneWave('grunt', 1));
    const e = firstEnemy(sim);
    place(sim, SUPPORT, e.x, 3);
    place(sim, RANGED, e.x, -3);
    place(sim, TANK, e.x, FAR_Y);
    sim.step();
    expect(e.attack.target).toBe(RANGED);
  });

  it('never picks a dead hero, and does not target the Ancient', () => {
    const sim = heldSim(oneWave('grunt', 1));
    const e = firstEnemy(sim);
    place(sim, TANK, e.x + 1, 0);
    unit(sim, TANK).hp = 0;
    sim.step();
    expect(e.attack.target).toBe(0);
    const ancient = unit(sim, 1);
    ancient.x = e.x + 1;
    ancient.y = 0;
    sim.step();
    expect(e.attack.target).toBe(0);
  });

  it('keeps its target while it is inside the leash even beyond aggro range', () => {
    const sim = heldSim(oneWave('grunt', 1));
    const e = firstEnemy(sim);
    place(sim, TANK, e.x + 2, 0);
    sim.step();
    expect(e.attack.target).toBe(TANK);
    place(sim, TANK, e.x + (AGGRO_RANGE + LEASH_RANGE) / 2, 0);
    sim.step();
    expect(e.attack.target).toBe(TANK);
  });
});

describe('taunt', () => {
  it('overrides the nearest hero, at any distance', () => {
    const sim = heldSim(oneWave('grunt', 1));
    const e = firstEnemy(sim);
    place(sim, RANGED, e.x + 1, 0);
    place(sim, TANK, e.x + 50, 0);
    e.statuses.push({ status: 'taunted', until: sim.tick + 100, src: TANK, value: 0 });
    sim.step();
    expect(e.attack.target).toBe(TANK);
    expect(e.move.mode).toBe('point');
  });

  it('is ignored once the taunter is dead, and falls back to the nearest hero', () => {
    const sim = heldSim(oneWave('grunt', 1));
    const e = firstEnemy(sim);
    place(sim, RANGED, e.x + 1, 0);
    place(sim, TANK, e.x + 50, 0);
    e.statuses.push({ status: 'taunted', until: sim.tick + 500, src: TANK, value: 0 });
    unit(sim, TANK).hp = 0;
    sim.step();
    expect(e.attack.target).toBe(RANGED);
  });
});

describe('leash', () => {
  it('drops a target that leaves the leash range and returns to the lane', () => {
    const sim = heldSim(oneWave('grunt', 1));
    const e = firstEnemy(sim);
    place(sim, TANK, e.x + 3, 0);
    sim.step();
    expect(e.attack.target).toBe(TANK);
    const { waypoint } = e.move;
    place(sim, TANK, e.x + LEASH_RANGE + 2, FAR_Y);
    sim.step();
    expect(e.attack.target).toBe(0);
    expect(e.move).toMatchObject({ mode: 'lane', waypoint });
    const { x } = e;
    sim.step();
    expect(e.x).toBeGreaterThan(x);
  });

  it('returns to the lane when the target dies, and then leaks as normal', () => {
    const sim = heldSim(oneWave('grunt', 1), 10);
    const e = firstEnemy(sim);
    place(sim, TANK, e.x + 3, 0);
    sim.step();
    unit(sim, TANK).hp = 0;
    sim.step();
    expect(e.move.mode).toBe('lane');
    const events = stepUntil(sim, (ev) => ev.some((x) => x.kind === 'leak'));
    expect(events.find((x) => x.kind === 'leak')).toMatchObject({ id: e.id, livesLost: 1 });
  });
});

describe('attacks', () => {
  it('stops next to the target and hits it every cooldown through dealDamage', () => {
    const sim = heldSim(oneWave('brute', 1));
    const brute = findById(defaultGame().enemies, 'brute');
    const e = firstEnemy(sim);
    place(sim, TANK, e.x + 4, 0);
    const events = stepUntil(sim, (ev) => ev.filter((x) => x.kind === 'dmg').length >= 3, 2000);
    const hits = events.filter((x) => x.kind === 'dmg');
    expect(hits.map((h) => (h.kind === 'dmg' ? [h.src, h.dst] : []))).toEqual([
      [e.id, TANK],
      [e.id, TANK],
      [e.id, TANK],
    ]);
    const cooldown = ticks(brute?.attack.cooldown ?? 0);
    expect(hits[1]?.tick).toBe((hits[0]?.tick ?? 0) + cooldown);
    expect(hits[2]?.tick).toBe((hits[1]?.tick ?? 0) + cooldown);
    expect(e.move.mode).toBe('idle');
    // Within reach: attack range plus the hero's body.
    const dx = unit(sim, TANK).x - e.x;
    expect(Math.abs(dx)).toBeLessThanOrEqual((brute?.attack.range ?? 0) + unit(sim, TANK).radius);
  });

  it('does not attack out of range, and a dead target is not hit', () => {
    const sim = heldSim(oneWave('grunt', 1));
    const e = firstEnemy(sim);
    place(sim, TANK, e.x + AGGRO_RANGE - 1, 0);
    expect(
      stepUntil(sim, () => false, 5)
        .filter((x) => x.kind === 'dmg')
        .map((x) => x.tick),
    ).toEqual([]);
    unit(sim, TANK).hp = 0;
    const dmg = stepUntil(sim, () => false, 300).filter((x) => x.kind === 'dmg' && x.dst === TANK);
    expect(dmg).toEqual([]);
  });

  it('a 0-hp enemy neither attacks nor leaks', () => {
    const sim = heldSim(oneWave('grunt', 1), 10);
    const e = firstEnemy(sim);
    place(sim, TANK, e.x + 1, 0);
    e.hp = 0;
    const events = sim.step();
    expect(events.filter((x) => x.kind === 'dmg' || x.kind === 'leak')).toEqual([]);
  });
});

describe('leaks', () => {
  it('cost exactly leakDamage per enemy and the Boss costs the most', () => {
    const sim = heldSim(oneWave('boss', 1), 20);
    const events = stepUntil(sim, (ev) => ev.some((x) => x.kind === 'leak'), 10_000);
    const boss = findById(defaultGame().enemies, 'boss');
    expect(events.find((x) => x.kind === 'leak')).toMatchObject({ livesLost: boss?.leakDamage });
    expect(unit(sim, 1).hp).toBe(20 - (boss?.leakDamage ?? 0));
  });
});
