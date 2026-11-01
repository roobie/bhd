// Psyker invariants (D-4TKP7DQRMLBK6K7W): Warp bounds, the backlash formula and its RNG isolation,
// Lash geometry. No tuned outcomes are pinned; numbers are read from the content def.

import { describe, expect, it } from 'vitest';
import { psykerDef } from '../../src/content/heroes/psyker.ts';
import { defaultGame } from '../../src/content/index.ts';
import { commandHero, downKit, heroSystem } from '../../src/sim/heroes/index.ts';
import { backlashChance, type PsykerState } from '../../src/sim/heroes/psyker.ts';
import { statusValue } from '../../src/sim/statuses.ts';
import { rig } from '../combat/rig.ts';

const def = psykerDef();

function setup() {
  const r = rig();
  const hero = [...r.sim.entities.values()].find((e) => e.kind === 'hero' && e.def === 'psyker');
  if (hero?.kit?.kind !== 'psyker') {
    throw new Error('no psyker');
  }
  const kit: PsykerState = hero.kit;
  hero.x = 0;
  hero.y = 0;
  const lash = (x: number, y: number) => commandHero(r.ctx, hero, { kind: 'ability', hero: hero.id, slot: 0, x, y });
  const tick = () => heroSystem(r.ctx);
  return { r, hero, kit, lash, tick };
}

describe('psyker content', () => {
  it('is in the default game', () => {
    expect(defaultGame().heroes.some((h) => h.id === 'psyker')).toBe(true);
  });
});

describe('backlash chance', () => {
  it('is max(0, warp - freeBelow) * chancePerPoint', () => {
    for (const warp of [0, 20, def.backlash.freeBelow, 63, 80, def.warp.max]) {
      expect(backlashChance(def, warp)).toBeCloseTo(
        Math.max(0, warp - def.backlash.freeBelow) * def.backlash.chancePerPoint,
      );
    }
    expect(backlashChance(def, def.backlash.freeBelow)).toBe(0);
  });
});

describe('warp', () => {
  it('stays within 0..max through attacks, casts and decay', () => {
    const s = setup();
    s.r.add({ x: 3, y: 0, maxHp: 1e9 });
    for (let i = 0; i < 600; i++) {
      s.kit.cdLash = 0;
      if (i % 5 === 0) {
        s.lash(3, 0);
      }
      s.tick();
      expect(s.kit.warp).toBeGreaterThanOrEqual(0);
      expect(s.kit.warp).toBeLessThanOrEqual(def.warp.max);
    }
  });

  it('decays when idle', () => {
    const s = setup();
    s.kit.warp = 50;
    s.tick();
    expect(s.kit.warp).toBeLessThan(50);
  });

  it('a landed basic attack adds Warp and is not tagged melee', () => {
    const s = setup();
    s.r.add({ x: 3, y: 0, maxHp: 1e9 });
    s.kit.warp = 50;
    s.tick();
    const shots = s.r.events.filter((e) => e.kind === 'dmg' && e.src === s.hero.id);
    expect(shots.length).toBe(1);
    for (const e of shots) {
      expect(e.kind === 'dmg' && e.tags.includes('melee')).toBe(false);
    }
    // +perHit then one tick of decay.
    expect(s.kit.warp).toBeGreaterThan(50);
  });

  it('resets when he goes down', () => {
    const s = setup();
    s.kit.warp = 80;
    s.kit.cdLash = 5;
    downKit(s.r.ctx, s.hero);
    expect(s.kit.warp).toBe(0);
    expect(s.kit.cdLash).toBe(0);
  });
});

describe('backlash roll', () => {
  it('draws only the kit stream; the sim rng and its state are untouched', () => {
    const s = setup();
    s.r.add({ x: 4, y: 0 });
    s.kit.warp = 90;
    const simBefore = [...s.r.ctx.rng.state];
    const kitBefore = [...s.kit.rng.state];
    s.lash(4, 0);
    expect(s.r.events.some((e) => e.kind === 'ability')).toBe(true);
    expect([...s.r.ctx.rng.state]).toEqual(simBefore);
    expect([...s.kit.rng.state]).not.toEqual(kitBefore);
  });

  it('is replayable: the same seed and casts give the same backlashes and kit stream', () => {
    const run = () => {
      const s = setup();
      s.r.add({ x: 4, y: 0, maxHp: 1e9 });
      const out: boolean[] = [];
      for (let i = 0; i < 40; i++) {
        s.kit.warp = 100;
        s.kit.cdLash = 0;
        const n = s.r.events.length;
        s.lash(4, 0);
        out.push(s.r.events.slice(n).some((e) => e.kind === 'backlash'));
      }
      return { out, rng: [...s.kit.rng.state] };
    };
    const a = run();
    expect(a).toEqual(run());
    expect(a.out.some(Boolean)).toBe(true);
    expect(a.out.every(Boolean)).toBe(false);
  });

  it('never fires at or below the free zone', () => {
    const s = setup();
    s.r.add({ x: 4, y: 0, maxHp: 1e9 });
    for (let i = 0; i < 100; i++) {
      s.kit.warp = def.backlash.freeBelow;
      s.kit.cdLash = 0;
      s.lash(4, 0);
    }
    expect(s.r.events.some((e) => e.kind === 'ability')).toBe(true);
    expect(s.r.events.some((e) => e.kind === 'backlash')).toBe(false);
  });

  it('discharges as ff splash on everything in radius, allies included, and reports a backlash event', () => {
    const s = setup();
    s.r.add({ x: 4, y: 0, maxHp: 1e9 });
    const ally = [...s.r.sim.entities.values()].find((e) => e.kind === 'hero' && e.id !== s.hero.id);
    if (ally === undefined) {
      throw new Error('no ally');
    }
    ally.x = 1;
    ally.y = 0;
    const { hp } = ally;
    let fired = false;
    for (let i = 0; i < 200 && !fired; i++) {
      s.kit.warp = 100;
      s.kit.cdLash = 0;
      s.lash(4, 0);
      fired = s.r.events.some((e) => e.kind === 'backlash');
    }
    expect(fired).toBe(true);
    const hit = s.r.events.find((e) => e.kind === 'dmg' && e.dst === ally.id);
    expect(hit?.kind === 'dmg' && hit.tags).toEqual(expect.arrayContaining(['ff', 'splash']));
    expect(ally.hp).toBeLessThan(hp);
  });
});

describe('gravitic lash', () => {
  it('moves targets toward the point, never past it, and applies Clumped', () => {
    const s = setup();
    const point = { x: 6, y: 0 };
    const near = s.r.add({ x: 8, y: 1 });
    const far = s.r.add({ x: 10, y: -2 });
    const d = (e: { x: number; y: number }) => Math.hypot(e.x - point.x, e.y - point.y);
    const before = [d(near), d(far)];
    s.lash(point.x, point.y);
    expect(d(near)).toBeLessThan(before[0] ?? 0);
    expect(d(far)).toBeLessThan(before[1] ?? 0);
    for (const e of [near, far]) {
      expect(statusValue(e, 'clumped')).toBeGreaterThan(0);
    }
    // An enemy already closer than the pull distance lands on the point, not beyond it.
    const s2 = setup();
    const close = s2.r.add({ x: 6.5, y: 0 });
    s2.lash(6, 0);
    expect(Math.hypot(close.x - 6, close.y)).toBeLessThanOrEqual(0.5);
  });

  it('is refused out of range or with nothing to pull, and spends no cooldown', () => {
    const s = setup();
    s.r.add({ x: 40, y: 0 });
    s.lash(40, 0);
    s.lash(5, 0);
    expect(s.kit.cdLash).toBe(0);
    expect(s.r.events.some((e) => e.kind === 'ability')).toBe(false);
  });
});
