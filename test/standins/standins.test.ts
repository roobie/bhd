// PLACEHOLDER stand-in heroes (slice stand-in-heroes): each generic ability's effect, taunt vs the
// real enemy aggro, heal capping, pull + Clumped, cooldowns and attack period exactness.

import { describe, expect, it } from 'vitest';
import { dealDamage } from '../../src/sim/combat.ts';
import type { TickContext } from '../../src/sim/context.ts';
import type { Entity } from '../../src/sim/entities.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { stateHash } from '../../src/sim/hash.ts';
import type { Sim } from '../../src/sim/sim.ts';
import { hasStatus, statusValue } from '../../src/sim/statuses.ts';
import { ticks } from '../../src/sim/time.ts';
import { firstEnemy, heldSim, oneWave, place, RANGED, SUPPORT, TANK, unit } from '../lane/rig.ts';

const ANCIENT = 1;
// One wave far in the future, so the game does not end as won while a test sets up.
const NO_WAVE = { ...oneWave('grunt', 1), firstDelay: 100_000 };

/** A held sim with no waves, heroes parked at (30, 40). */
function quiet(): Sim {
  return heldSim(NO_WAVE);
}

/** Spawns an idle enemy through the debug command and returns it. */
function spawn(sim: Sim, def: string, x: number, y: number): Entity {
  const before = sim.entities.nextId;
  sim.command(0, { kind: 'spawn', def, x, y });
  sim.step();
  const e = sim.entities.get(before);
  if (e === undefined) {
    throw new Error('spawn failed');
  }
  return e;
}

function stepN(sim: Sim, n: number): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) {
    out.push(...sim.step());
  }
  return out;
}

function abilityEvents(events: readonly SimEvent[], hero: number): SimEvent[] {
  return events.filter((e) => e.kind === 'ability' && e.hero === hero);
}

function ctxOf(sim: Sim): TickContext {
  return {
    tick: sim.tick,
    entities: sim.entities,
    rng: sim.rng,
    emit: () => undefined,
    game: sim.game,
    waves: sim.waves,
    ancientId: ANCIENT,
    killers: new Map<number, number>(),
    end: () => undefined,
  };
}

describe('tank: taunt', () => {
  it('redirects enemy aggro from the nearest hero to the tank, from any distance, then expires', () => {
    const sim = heldSim(oneWave('grunt', 1));
    const e = firstEnemy(sim);
    place(sim, RANGED, e.x + 3, 0);
    place(sim, TANK, e.x + 7.5, 0); // inside the 8 radius, outside the 6 aggro range
    place(sim, SUPPORT, 30, 40);
    sim.step();
    expect(e.attack.target).toBe(RANGED);
    sim.command(0, { kind: 'ability', hero: TANK, slot: 0 });
    const events = sim.step();
    expect(abilityEvents(events, TANK)).toEqual([
      { tick: sim.tick, kind: 'ability', hero: TANK, slot: 0, target: 0, value: 1 },
    ]);
    expect(e.attack.target).toBe(TANK);
    expect(e.statuses).toEqual([{ status: 'taunted', src: TANK, until: sim.tick + ticks(3), value: 0 }]);
    // Even when the tank is moved far away, the taunt holds until it ends.
    place(sim, TANK, e.x + 20, 0);
    stepN(sim, ticks(3) - 2);
    expect(e.attack.target).toBe(TANK);
    stepN(sim, 2);
    expect(hasStatus(e, 'taunted')).toBe(false);
    expect(e.attack.target).not.toBe(TANK);
  });

  it('only taunts enemies in radius, and does nothing (no cooldown) with none', () => {
    const sim = quiet();
    place(sim, TANK, 0, 0);
    expect(abilityEvents(stepCmd(sim, TANK, 0), TANK)).toEqual([]);
    expect(kitCooldowns(sim, TANK)).toEqual([0, 0, 0, 0]);
    const near = spawn(sim, 'grunt', 7, 0); // 7 <= 8 + 0.5
    const edge = spawn(sim, 'grunt', 8.4, 0); // body touches radius 8
    const far = spawn(sim, 'grunt', 9.5, 0);
    const events = stepCmd(sim, TANK, 0);
    expect(abilityEvents(events, TANK)[0]).toMatchObject({ value: 2 });
    expect(hasStatus(near, 'taunted')).toBe(true);
    expect(hasStatus(edge, 'taunted')).toBe(true);
    expect(hasStatus(far, 'taunted')).toBe(false);
  });
});

function stepCmd(
  sim: Sim,
  hero: number,
  slot: number,
  aim: { x?: number; y?: number; target?: number } = {},
): SimEvent[] {
  sim.command(0, { kind: 'ability', hero, slot, ...aim });
  return sim.step();
}

function kitCooldowns(sim: Sim, hero: number): number[] {
  const { kit } = unit(sim, hero);
  if (kit?.kind !== 'standin') {
    throw new Error('not a stand-in');
  }
  return kit.cooldowns;
}

describe('ranged: mark shot', () => {
  it('marks the target (+25%) and the next hit consumes it', () => {
    const sim = quiet();
    place(sim, RANGED, 0, 0);
    const grunt = spawn(sim, 'brute', 10, 0); // armour 8
    const events = stepCmd(sim, RANGED, 0, { target: grunt.id });
    expect(abilityEvents(events, RANGED)).toEqual([
      { tick: sim.tick, kind: 'ability', hero: RANGED, slot: 0, target: grunt.id, value: 0.25 },
    ]);
    expect(grunt.statuses).toEqual([{ status: 'marked', src: RANGED, until: sim.tick + ticks(4), value: 0.25 }]);
    // 20 * 1.25 = 25, minus 8 armour = 17 (unmarked would be 12).
    expect(dealDamage(ctxOf(sim), { src: RANGED, dst: grunt.id, amount: 20, tags: [] })).toBe(17);
    expect(hasStatus(grunt, 'marked')).toBe(false);
    expect(dealDamage(ctxOf(sim), { src: RANGED, dst: grunt.id, amount: 20, tags: [] })).toBe(12);
  });

  it('the ranged hero basic attack benefits from its own mark', () => {
    const sim = quiet();
    place(sim, RANGED, 0, 0);
    const brute = spawn(sim, 'brute', 10, 0);
    unitKit(sim, RANGED).hold = false;
    const events = stepCmd(sim, RANGED, 0, { target: brute.id });
    const hit = events.find((e) => e.kind === 'dmg' && e.src === RANGED);
    expect(hit).toMatchObject({ dst: brute.id, amount: 17 });
  });

  it('fails out of range or on a friendly, without spending the cooldown', () => {
    const sim = quiet();
    place(sim, RANGED, 0, 0);
    const far = spawn(sim, 'grunt', 20, 0);
    expect(abilityEvents(stepCmd(sim, RANGED, 0, { target: far.id }), RANGED)).toEqual([]);
    expect(abilityEvents(stepCmd(sim, RANGED, 0, { target: TANK }), RANGED)).toEqual([]);
    expect(hasStatus(far, 'marked')).toBe(false);
    expect(kitCooldowns(sim, RANGED)).toEqual([0, 0, 0, 0]);
  });

  it('without a named target marks the nearest hostile in range', () => {
    const sim = quiet();
    place(sim, RANGED, 0, 0);
    spawn(sim, 'grunt', 12, 0);
    const near = spawn(sim, 'grunt', 5, 0);
    stepCmd(sim, RANGED, 0);
    expect(hasStatus(near, 'marked')).toBe(true);
  });
});

function unitKit(sim: Sim, id: number): { hold: boolean; autocast: number } {
  const { kit } = unit(sim, id);
  if (kit === undefined) {
    throw new Error('no kit');
  }
  return kit;
}

describe('support: heal pulse', () => {
  it('heals heroes in radius, caps at maxHp, skips the Ancient and heroes out of radius', () => {
    const sim = quiet();
    place(sim, SUPPORT, 55, 0);
    place(sim, TANK, 52, 0);
    place(sim, RANGED, 50, 0);
    const tank = unit(sim, TANK);
    const ranged = unit(sim, RANGED);
    const ancient = unit(sim, ANCIENT);
    tank.hp = tank.maxHp - 20; // heals only 20
    ranged.hp = 100; // heals 80
    ancient.hp = 10; // within radius of (55, 0), but never healed
    const events = stepCmd(sim, SUPPORT, 0);
    expect(tank.hp).toBe(tank.maxHp);
    expect(ranged.hp).toBe(180);
    expect(ancient.hp).toBe(10);
    const heals = events.filter((e) => e.kind === 'heal');
    expect(heals).toEqual([
      { tick: sim.tick, kind: 'heal', src: SUPPORT, dst: TANK, amount: 20 },
      { tick: sim.tick, kind: 'heal', src: SUPPORT, dst: RANGED, amount: 80 },
    ]);
    expect(abilityEvents(events, SUPPORT)[0]).toMatchObject({ slot: 0, value: 100 });
  });

  it('skips heroes beyond the radius', () => {
    const sim = quiet();
    place(sim, SUPPORT, 0, 0);
    place(sim, TANK, 9, 0);
    place(sim, RANGED, 30, 40);
    const tank = unit(sim, TANK);
    tank.hp = 100;
    stepCmd(sim, SUPPORT, 0);
    expect(tank.hp).toBe(100);
  });
});

describe('support: pull', () => {
  it('moves enemies in radius toward the point (no overshoot, ID order), then clumped boosts area hits', () => {
    const sim = quiet();
    place(sim, SUPPORT, 5, 0);
    const a = spawn(sim, 'grunt', 8, 0); // 2 from the point: lands on it
    const b = spawn(sim, 'grunt', 15, 0); // 5 away: pulled 4, to 11
    const c = spawn(sim, 'grunt', 10, 3); // 3 away: lands on it
    const out = spawn(sim, 'grunt', 30, 0);
    const events = stepCmd(sim, SUPPORT, 1, { x: 10, y: 0 });
    expect(abilityEvents(events, SUPPORT)[0]).toMatchObject({ slot: 1, value: 3 });
    expect([a.x, a.y]).toEqual([10, 0]);
    expect(b.x).toBeCloseTo(11, 12);
    expect(b.y).toBeCloseTo(0, 12);
    expect(c.x).toBeCloseTo(10, 12);
    expect(c.y).toBeCloseTo(0, 12);
    expect([out.x, out.y]).toEqual([30, 0]);
    for (const e of [a, b, c]) {
      expect(e.statuses).toEqual([{ status: 'clumped', src: SUPPORT, until: sim.tick + ticks(2), value: 0.3 }]);
    }
    expect(hasStatus(out, 'clumped')).toBe(false);
    a.hp = 1000;
    a.maxHp = 1000;
    const ctx = ctxOf(sim);
    // armour 1: line 100 * 1.3 = 130 - 1 = 129; a plain hit is unaffected: 99.
    expect(dealDamage(ctx, { src: TANK, dst: a.id, amount: 100, tags: ['line'] })).toBeCloseTo(129, 9);
    expect(dealDamage(ctx, { src: TANK, dst: a.id, amount: 100, tags: [] })).toBe(99);
    expect(statusValue(a, 'clumped')).toBe(0.3);
  });

  it('is out of range or has no point: nothing happens and no cooldown is spent', () => {
    const sim = quiet();
    place(sim, SUPPORT, 0, 0);
    const e = spawn(sim, 'grunt', 30, 0);
    expect(abilityEvents(stepCmd(sim, SUPPORT, 1, { x: 30, y: 0 }), SUPPORT)).toEqual([]);
    expect(abilityEvents(stepCmd(sim, SUPPORT, 1), SUPPORT)).toEqual([]);
    expect(e.x).toBe(30);
    expect(kitCooldowns(sim, SUPPORT)).toEqual([0, 0, 0, 0]);
  });

  it('with a target and no point, pulls toward that unit', () => {
    const sim = quiet();
    place(sim, SUPPORT, 0, 0);
    const lead = spawn(sim, 'grunt', 8, 0);
    const other = spawn(sim, 'grunt', 8, 4);
    stepCmd(sim, SUPPORT, 1, { target: lead.id });
    expect(other.y).toBeCloseTo(0, 12);
    expect(other.x).toBeCloseTo(8, 12);
  });
});

describe('cooldowns', () => {
  it('an ability is ready again exactly ticks(cooldown) after the cast', () => {
    const sim = quiet();
    place(sim, TANK, 0, 0);
    spawn(sim, 'grunt', 3, 0);
    const cast = sim.tick + 1;
    expect(abilityEvents(stepCmd(sim, TANK, 0), TANK)).toHaveLength(1);
    expect(kitCooldowns(sim, TANK)[0]).toBe(ticks(8) - 1);
    const early = stepN(sim, ticks(8) - 2); // up to tick cast + 239 - 1
    expect(abilityEvents(early, TANK)).toEqual([]);
    sim.command(0, { kind: 'ability', hero: TANK, slot: 0 }, cast + ticks(8) - 1);
    expect(abilityEvents(sim.step(), TANK)).toEqual([]);
    sim.command(0, { kind: 'ability', hero: TANK, slot: 0 }, cast + ticks(8));
    expect(abilityEvents(sim.step(), TANK)).toHaveLength(1);
  });

  it('slots are independent and a missing slot is a no-op', () => {
    const sim = quiet();
    place(sim, SUPPORT, 0, 0);
    spawn(sim, 'grunt', 3, 0);
    expect(abilityEvents(stepCmd(sim, SUPPORT, 0), SUPPORT)).toHaveLength(1);
    expect(abilityEvents(stepCmd(sim, SUPPORT, 1, { x: 3, y: 0 }), SUPPORT)).toHaveLength(1);
    expect(abilityEvents(stepCmd(sim, SUPPORT, 2), SUPPORT)).toEqual([]);
    expect(abilityEvents(stepCmd(sim, SUPPORT, 0), SUPPORT)).toEqual([]);
  });

  it('cooldowns are part of the state hash', () => {
    const a = quiet();
    const b = quiet();
    place(a, TANK, 0, 0);
    place(b, TANK, 0, 0);
    spawn(a, 'grunt', 3, 0);
    spawn(b, 'grunt', 3, 0);
    const hash = (s: Sim): string =>
      stateHash({ tick: s.tick, ended: s.ended, entities: s.entities, waves: s.waves, rng: s.rng });
    expect(hash(a)).toBe(hash(b));
    unitKit(a, TANK);
    const { kit } = unit(a, TANK);
    if (kit?.kind === 'standin') {
      kit.cooldowns[2] = 5;
    }
    expect(hash(a)).not.toBe(hash(b));
  });
});

describe('autocast', () => {
  it('fires an off-cooldown ability with a valid target and re-fires exactly on cooldown', () => {
    const sim = quiet();
    place(sim, TANK, 0, 0);
    sim.command(0, { kind: 'autocast', hero: TANK, slot: 0, on: true });
    expect(abilityEvents(stepN(sim, 5), TANK)).toEqual([]); // no enemy in radius
    spawn(sim, 'grunt', 3, 0);
    const events = stepN(sim, ticks(8) * 2 + 2);
    const casts = abilityEvents(events, TANK);
    expect(casts).toHaveLength(2);
    expect((casts[1]?.tick ?? 0) - (casts[0]?.tick ?? 0)).toBe(ticks(8));
  });

  it('heal pulse autocasts only when a hero in radius is hurt', () => {
    const sim = quiet();
    place(sim, SUPPORT, 0, 0);
    place(sim, TANK, 2, 0);
    sim.command(0, { kind: 'autocast', hero: SUPPORT, slot: 0, on: true });
    expect(abilityEvents(stepN(sim, 5), SUPPORT)).toEqual([]);
    unit(sim, TANK).hp = 500;
    expect(abilityEvents(stepN(sim, 2), SUPPORT)).toHaveLength(1);
    expect(unit(sim, TANK).hp).toBe(580);
  });
});

describe('basic attack period', () => {
  it.each([
    ['ranged', RANGED, 1],
    ['tank', TANK, 1],
    ['support', SUPPORT, 1],
  ])('the %s fires exactly every ticks(cooldown)', (_name, id, seconds) => {
    const sim = quiet();
    unitKit(sim, id).hold = false;
    place(sim, id, 0, 0);
    const boss = spawn(sim, 'boss', 1.5, 0);
    boss.armour = 0;
    boss.maxHp = 1_000_000;
    boss.hp = 1_000_000;
    const events = stepN(sim, ticks(seconds) * 5 + 2);
    const shots = events.filter((e) => e.kind === 'dmg' && e.src === id).map((e) => e.tick);
    expect(shots.length).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < shots.length; i++) {
      expect((shots[i] ?? 0) - (shots[i - 1] ?? 0)).toBe(ticks(seconds));
    }
  });

  it('the tank hits melee-tagged, ranged heroes untagged', () => {
    const sim = quiet();
    place(sim, TANK, 0, 0);
    place(sim, RANGED, 0, 1);
    spawn(sim, 'brute', 1.5, 0);
    unitKit(sim, TANK).hold = false;
    unitKit(sim, RANGED).hold = false;
    const dmg = stepN(sim, 3).filter((e) => e.kind === 'dmg');
    expect(dmg.find((e) => e.kind === 'dmg' && e.src === TANK)).toMatchObject({ tags: ['melee'] });
    expect(dmg.find((e) => e.kind === 'dmg' && e.src === RANGED)).toMatchObject({ tags: [] });
  });
});
