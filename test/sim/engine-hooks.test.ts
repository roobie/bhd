// Engine-prep specs (w8 step 1): the hooks and entities the hero kits build on. Mechanics only: no
// tuned numbers are asserted (the content values are free to change).

import { describe, expect, it } from 'vitest';
import { defaultGame } from '../../src/content/index.ts';
import { dealDamage, heal } from '../../src/sim/combat.ts';
import type { Hooks } from '../../src/sim/context.ts';
import { spawnProp } from '../../src/sim/props.ts';
import { firstBarrier, nearestHostile, unitsInRadius } from '../../src/sim/query.ts';
import { Sim } from '../../src/sim/sim.ts';
import { rig } from '../combat/rig.ts';

const GUNNER = 2;
const PENITENT = 3;
const FLOOR = 7;

function hero(r: ReturnType<typeof rig>, id: number) {
  const e = r.sim.entities.get(id);
  if (e === undefined) {
    throw new Error(`no hero ${id}`);
  }
  return e;
}

describe('damageTaken hook', () => {
  const hooks: Hooks = {
    damageTaken: (_ctx, hit) => ({ amount: hit.amount, minHp: FLOOR }),
    healTaken: (_ctx, _t, amount) => amount,
  };

  it('floors same-team hits only', () => {
    const r = rig();
    const ctx = { ...r.ctx, hooks };
    const victim = hero(r, PENITENT);
    dealDamage(ctx, { src: GUNNER, dst: PENITENT, amount: victim.maxHp * 2, tags: ['ff'] });
    expect(victim.hp).toBe(FLOOR);
    const enemy = r.add();
    dealDamage(ctx, { src: enemy.id, dst: PENITENT, amount: 1e6, tags: [] });
    expect(victim.hp).toBe(0);
  });

  it('never heals a victim already under the floor', () => {
    const r = rig();
    const ctx = { ...r.ctx, hooks };
    const victim = hero(r, PENITENT);
    victim.hp = 2;
    dealDamage(ctx, { src: GUNNER, dst: PENITENT, amount: 50, tags: ['ff'] });
    expect(victim.hp).toBe(2);
  });

  it('can scale the amount', () => {
    const r = rig();
    const ctx = { ...r.ctx, hooks: { ...hooks, damageTaken: () => ({ amount: 1, minHp: 0 }) } };
    const victim = hero(r, PENITENT);
    const before = victim.hp;
    dealDamage(ctx, { src: GUNNER, dst: PENITENT, amount: 100, tags: ['ff'] });
    expect(victim.hp).toBe(before - 1);
  });
});

describe('healTaken hook', () => {
  it('scales the healing', () => {
    const r = rig();
    const ctx = { ...r.ctx, hooks: { ...r.ctx.hooks, healTaken: (_c: unknown, _t: unknown, a: number) => a / 2 } };
    const target = hero(r, PENITENT);
    target.hp = 10;
    const healed = heal(ctx, { src: GUNNER, dst: PENITENT, amount: 20, tags: [] });
    expect(healed).toBe(10);
    expect(target.hp).toBe(20);
  });
});

describe('props', () => {
  function placed(r: ReturnType<typeof rig>) {
    const p = spawnProp(r.ctx, {
      def: 'pavise',
      owner: GUNNER,
      x: 5,
      y: 0,
      ux: 0,
      uy: 1,
      halfLength: 2,
      durationTicks: 10,
    });
    if (p === undefined) {
      throw new Error('no prop');
    }
    return p;
  }

  it('clips a segment that crosses it, and only for the other team when asked', () => {
    const r = rig();
    placed(r);
    const from = { x: 0, y: 0 };
    const to = { x: 10, y: 0 };
    const t = firstBarrier(r.sim.entities, from, to);
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    // The prop is the Gunner's team (0): enemy melee (team 1) is blocked, an ally's is not.
    expect(firstBarrier(r.sim.entities, from, to, 1)).toBe(t);
    expect(firstBarrier(r.sim.entities, from, to, 0)).toBeUndefined();
    // A segment that stops short, or runs beside it, is untouched.
    expect(firstBarrier(r.sim.entities, from, { x: 3, y: 0 })).toBeUndefined();
    expect(firstBarrier(r.sim.entities, { x: 0, y: 5 }, { x: 10, y: 5 })).toBeUndefined();
  });

  it('is never targeted, hit or healed', () => {
    const r = rig();
    const p = placed(r);
    r.add({ x: 5, y: 0, team: 1 });
    expect(unitsInRadius(r.sim.entities, { x: 5, y: 0 }, 50).some((u) => u.id === p.id)).toBe(false);
    expect(nearestHostile(r.sim.entities, { x: 5, y: 0, team: 1 }, 50)?.id).not.toBe(p.id);
    expect(dealDamage(r.ctx, { src: GUNNER, dst: p.id, amount: 5, tags: [] })).toBe(0);
    expect(heal(r.ctx, { src: GUNNER, dst: p.id, amount: 5, tags: [] })).toBe(0);
    expect(p.hp).toBe(p.maxHp);
  });

  it('expires', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    const [first] = [...sim.entities.values()].filter((e) => e.kind === 'hero');
    if (first === undefined) {
      throw new Error('no hero');
    }
    sim.entities.add({
      kind: 'prop',
      def: 'pavise',
      team: 0,
      x: 1,
      y: 1,
      radius: 0,
      maxHp: 1,
      armour: 0,
      speed: 0,
      prop: { owner: first.id, until: 3, ux: 1, uy: 0, halfLength: 1 },
    });
    const props = () => [...sim.entities.values()].filter((e) => e.kind === 'prop').length;
    sim.step();
    expect(props()).toBe(1);
    for (let i = 0; i < 5; i++) {
      sim.step();
    }
    expect(props()).toBe(0);
  });
});

describe('hero respawn', () => {
  function downed() {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    const h = sim.entities.get(GUNNER);
    if (h === undefined) {
      throw new Error('no gunner');
    }
    h.x += 5;
    h.hp = 0;
    return { sim, h };
  }

  it('keeps the hero, ignores commands while down, and revives it at its spawn', () => {
    const { sim, h } = downed();
    const [spawn] = sim.game.map.heroSpawns;
    const events = sim.step();
    expect(events.some((e) => e.kind === 'death' && e.id === GUNNER)).toBe(true);
    expect(sim.entities.get(GUNNER)).toBe(h);
    const { x } = h;
    sim.command(0, { kind: 'move', hero: GUNNER, x: 1, y: 1 });
    sim.step();
    expect(h.x).toBe(x);
    expect(h.hp).toBe(0);
    let respawned = false;
    for (let i = 0; i < 5000 && !respawned; i++) {
      respawned = sim.step().some((e) => e.kind === 'respawn' && e.id === GUNNER);
    }
    expect(respawned).toBe(true);
    expect(h.hp).toBe(h.maxHp);
    expect(spawn).toBeDefined();
    expect(h.x).toBe(spawn?.x);
    expect(h.y).toBe(spawn?.y);
  });

  it('is slower in later waves, never past the max', () => {
    const { sim } = downed();
    sim.step();
    const early = sim.entities.get(GUNNER)?.kit?.respawnAt ?? 0;
    const late = new Sim({ seed: 1, game: defaultGame() });
    late.waves.n = 1000;
    const g = late.entities.get(GUNNER);
    if (g === undefined) {
      throw new Error('no gunner');
    }
    g.hp = 0;
    late.step();
    const lateAt = g.kit?.respawnAt ?? 0;
    expect(lateAt).toBeGreaterThanOrEqual(early);
    expect(lateAt).toBeLessThanOrEqual(1 + 30 * late.game.rules.respawn.max);
  });

  it('ends the game with team-wiped only when the rule is on', () => {
    for (const wipeLoses of [false, true]) {
      const game = defaultGame();
      const sim = new Sim({ seed: 1, game: { ...game, rules: { ...game.rules, wipeLoses } } });
      for (const e of sim.entities.values()) {
        if (e.kind === 'hero') {
          e.hp = 0;
        }
      }
      sim.step();
      expect(sim.ended).toBe(wipeLoses);
    }
  });
});

describe('callWave', () => {
  function waveStarts(sim: Sim, ticks: number): number[] {
    const out: number[] = [];
    for (let i = 0; i < ticks; i++) {
      for (const e of sim.step()) {
        if (e.kind === 'wave' && e.phase === 'start') {
          out.push(e.tick);
        }
      }
    }
    return out;
  }

  it('starts the next wave now, and does nothing once the waves are spent', () => {
    const game = defaultGame();
    const sim = new Sim({ seed: 1, game });
    const due = sim.waves.nextAt;
    expect(due).toBeGreaterThan(10);
    sim.step();
    sim.command(0, { kind: 'callWave' });
    const starts = waveStarts(sim, 3);
    expect(starts.length).toBe(1);
    expect(starts[0]).toBeLessThan(due);
    const spent = new Sim({ seed: 1, game });
    spent.waves.n = game.waves.waves.length;
    const before = spent.waves.nextAt;
    spent.command(0, { kind: 'callWave' });
    spent.step();
    expect(spent.waves.nextAt).toBe(before);
  });
});
