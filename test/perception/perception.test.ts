// Perception invariants (D-4E4QRJ7N6LIGZDSD): clump partition and order, determinism, memory fold
// equivalence (lazy vs eager), plain-data output, lineAllies geometry. No gameplay outcomes.

import { describe, expect, it } from 'vitest';
import { defaultGame } from '../../src/content/index.ts';
import { defaultPerception } from '../../src/content/perception.ts';
import { buildClumps } from '../../src/perception/clumps.ts';
import { findComboWindows } from '../../src/perception/combos.ts';
import { createMemory, foldEvents } from '../../src/perception/memory.ts';
import { perceive } from '../../src/perception/perceive.ts';
import { heroThreat } from '../../src/perception/threat.ts';
import type { EnemyView, StatusView } from '../../src/perception/types.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { Sim } from '../../src/sim/sim.ts';

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
    return s / 4_294_967_296;
  };
}

function enemy(id: number, at: { x: number; y: number; progress: number }, statuses: StatusView[] = []): EnemyView {
  return { id, def: 'grunt', ...at, hp: 10, hpFrac: 1, dps: 2, target: 0, statuses };
}

function randomEnemies(n: number, seed: number): EnemyView[] {
  const rnd = lcg(seed);
  return Array.from({ length: n }, (_, i) =>
    enemy(i + 1, { x: rnd() * 60, y: rnd() * 20, progress: Math.floor(rnd() * 20) }),
  );
}

/** Runs a default-game sim, returning the events per tick. */
function record(ticksToRun: number): { sim: Sim; perTick: SimEvent[][] } {
  const sim = new Sim({ seed: 7, game: defaultGame() });
  const perTick: SimEvent[][] = [];
  for (let i = 0; i < ticksToRun; i++) {
    perTick.push(sim.step());
  }
  return { sim, perTick };
}

function eagerMemory(perTick: readonly SimEvent[][]) {
  const mem = createMemory(defaultPerception());
  perTick.forEach((events, i) => {
    foldEvents(mem, events, i + 1);
  });
  return mem;
}

describe('clumps', () => {
  it('partition the enemies: each id in exactly one clump, counts consistent', () => {
    for (const seed of [1, 2, 3]) {
      const enemies = randomEnemies(100, seed);
      const clumps = buildClumps(enemies, 5);
      const seen = clumps.flatMap((c) => [...c.members]);
      expect(seen.length).toBe(enemies.length);
      expect(new Set(seen).size).toBe(enemies.length);
      for (const [i, c] of clumps.entries()) {
        expect(c.id).toBe(i);
        expect(c.count).toBe(c.members.length);
        expect(c.members.length).toBeGreaterThan(0);
      }
    }
  });

  it('follow the sweep: members and clump order by descending progress then ascending id', () => {
    const enemies = randomEnemies(80, 9);
    const rank = new Map(
      [...enemies].sort((a, b) => b.progress - a.progress || a.id - b.id).map((e, i) => [e.id, i] as const),
    );
    const clumps = buildClumps(enemies, 5);
    let prevFirst = -1;
    for (const c of clumps) {
      const ranks = c.members.map((id) => rank.get(id) ?? -1);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      expect(ranks[0]).toBeGreaterThan(prevFirst);
      prevFirst = ranks[0] ?? -1;
      const front = Math.max(...c.members.map((id) => enemies.find((e) => e.id === id)?.progress ?? 0));
      expect(c.front).toBe(front);
    }
  });

  it('do not depend on input order', () => {
    const enemies = randomEnemies(60, 4);
    expect(buildClumps([...enemies].reverse(), 5)).toEqual(buildClumps(enemies, 5));
  });

  it('is empty for no enemies', () => {
    expect(buildClumps([], 5)).toEqual([]);
  });
});

describe('combo windows and threat', () => {
  const rules = { statuses: ['clumped', 'marked'], minCount: 2 };
  const st = (status: string, until: number): StatusView => ({ status, until, src: 0, value: 0 });

  it('needs minCount carriers of one status in one clump; reports count and latest until', () => {
    const enemies = [
      enemy(1, { x: 0, y: 0, progress: 5 }, [st('clumped', 40), st('marked', 90)]),
      enemy(2, { x: 1, y: 0, progress: 4 }, [st('clumped', 60)]),
      enemy(3, { x: 2, y: 0, progress: 3 }),
    ];
    const clumps = buildClumps(enemies, 5);
    const windows = findComboWindows(enemies, clumps, rules);
    expect(windows.map((w) => w.status)).toEqual(['clumped']);
    expect(windows[0]?.count).toBe(2);
    expect(windows[0]?.until).toBe(60);
    expect(findComboWindows(enemies, clumps, rules)).toEqual(windows);
  });

  it('threat counts enemies attacking the hero even when out of radius', () => {
    const hero = { id: 9, x: 0, y: 0, maxHp: 100 };
    const far = { ...enemy(1, { x: 500, y: 0, progress: 0 }), target: 9 };
    expect(heroThreat(hero, [enemy(1, { x: 500, y: 0, progress: 0 })], 12)).toBe(0);
    expect(heroThreat(hero, [far], 12)).toBeGreaterThan(0);
  });
});

describe('memory', () => {
  it('lazy fold (all events at the final tick) equals the eager per-tick fold', () => {
    const { perTick } = record(1200);
    const eager = eagerMemory(perTick);
    const lazy = createMemory(defaultPerception());
    foldEvents(lazy, perTick.flat(), perTick.length);
    expect(lazy.damage).toEqual(eager.damage);
    expect(lazy.leaks).toEqual(eager.leaks);
  });

  it('keeps only samples inside the window', () => {
    const { perTick } = record(1200);
    const mem = eagerMemory(perTick);
    const oldest = perTick.length - 6 * 30;
    for (const s of [...mem.damage, ...mem.leaks]) {
      expect(s.tick).toBeGreaterThan(oldest);
    }
  });
});

describe('perceive', () => {
  function seen() {
    const { sim, perTick } = record(900);
    return { sim, mem: eagerMemory(perTick) };
  }

  it('is deterministic and does not mutate sim or memory', () => {
    const { sim, mem } = seen();
    const a = perceive(sim, mem);
    expect(perceive(sim, mem)).toEqual(a);
    const twin = seen();
    expect(perceive(twin.sim, twin.mem)).toEqual(a);
  });

  it('covers every live enemy in exactly one clump, enemies ascending by id', () => {
    const { sim, mem } = seen();
    const p = perceive(sim, mem);
    expect(p.enemies.length).toBeGreaterThan(0);
    const ids = p.enemies.map((e) => e.id);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(p.clumps.flatMap((c) => [...c.members]).sort((a, b) => a - b)).toEqual(ids);
  });

  it('returns plain data sharing no object with the sim', () => {
    const { sim, mem } = seen();
    const p = perceive(sim, mem);
    const walk = (v: unknown, into: Set<object>): void => {
      if (typeof v !== 'object' || v === null || into.has(v)) {
        return;
      }
      into.add(v);
      for (const k of v instanceof Map ? [...v.values()] : Object.values(v)) {
        walk(k, into);
      }
    };
    const simObjects = new Set<object>();
    walk(sim.entities, simObjects);
    walk(sim.intents, simObjects);
    const mine = new Set<object>();
    walk(p, mine);
    expect(mine.size).toBeGreaterThan(0);
    for (const o of mine) {
      expect(simObjects.has(o)).toBe(false);
      const proto = Object.getPrototypeOf(o);
      expect(proto === Object.prototype || proto === Array.prototype).toBe(true);
    }
  });

  it("fills the Gunner's lineAllies with exactly the allies on its line to its target", () => {
    const sim = new Sim({ seed: 7, game: defaultGame() });
    const mem = createMemory(defaultPerception());
    const gunnerOf = () => perceive(sim, mem).heroes.find((h) => h.kit === 'gunner');
    let gun = gunnerOf();
    for (let i = 0; i < 4000 && (gun === undefined || gun.target === 0); i++) {
      sim.step();
      gun = gunnerOf();
    }
    expect(gun?.target).toBeGreaterThan(0);
    const target = sim.entities.get(gun?.target ?? 0);
    const shooter = sim.entities.get(gun?.id ?? 0);
    const others = perceive(sim, mem).heroes.filter((h) => h.id !== gun?.id);
    const ally = sim.entities.get(others[0]?.id ?? 0);
    if (gun === undefined || target === undefined || shooter === undefined || ally === undefined) {
      throw new Error('setup');
    }
    for (const h of others) {
      const e = sim.entities.get(h.id);
      if (e !== undefined) {
        e.x = shooter.x - 200;
        e.y = shooter.y - 200;
      }
    }
    const lineAllies = () => perceive(sim, mem).heroes.find((h) => h.id === gun.id)?.lineAllies;
    expect(lineAllies()).toEqual([]);
    ally.x = (shooter.x + target.x) / 2;
    ally.y = (shooter.y + target.y) / 2;
    expect(lineAllies()).toEqual([ally.id]);
    ally.x = shooter.x - (target.x - shooter.x);
    ally.y = shooter.y - (target.y - shooter.y);
    expect(lineAllies()).toEqual([]);
  });
});

describe('perception fields for the client shell', () => {
  const heroOf = (sim: Sim, slot: number) => {
    const h = perceive(sim, createMemory(defaultPerception())).heroes[slot];
    if (h === undefined) {
      throw new Error(`no hero in slot ${slot}`);
    }
    return h;
  };

  it('abilities carry a cooldown length that bounds the time left', () => {
    const { sim } = record(60);
    const p = perceive(sim, createMemory(defaultPerception()));
    for (const h of p.heroes) {
      for (const a of h.abilities) {
        expect(a.cooldownTicks).toBeGreaterThanOrEqual(0);
        expect(a.cooldownLeft).toBeLessThanOrEqual(a.cooldownTicks);
        expect(!a.ready || a.cooldownLeft === 0).toBe(true);
      }
    }
  });

  it('a cast starts a cooldown that counts down within its length', () => {
    const { sim } = record(5);
    const gunner = heroOf(sim, 0);
    expect(sim.command(0, { kind: 'ability', hero: gunner.id, slot: 3 }).ok).toBe(true);
    sim.step();
    const after = heroOf(sim, 0).abilities.find((a) => a.slot === 3);
    expect(after?.cooldownLeft).toBeGreaterThan(0);
    expect(after?.cooldownLeft).toBeLessThanOrEqual(after?.cooldownTicks ?? 0);
  });

  it('resource marks are ascending fractions of the bar', () => {
    const { sim } = record(5);
    for (const h of perceive(sim, createMemory(defaultPerception())).heroes) {
      for (const r of h.resources) {
        expect(r.marks.every((m, i) => m > 0 && m <= 1 && (i === 0 || m > (r.marks[i - 1] ?? 0)))).toBe(true);
      }
    }
  });

  it('autocast reports the toggles the commands set, one bit per slot', () => {
    const sim = new Sim({ seed: 7, game: defaultGame() });
    const hero = heroOf(sim, 3);
    expect(hero.autocast).toBe(0);
    sim.command(3, { kind: 'autocast', hero: hero.id, slot: 1, on: true }, 1);
    sim.step();
    expect(heroOf(sim, 3).autocast).toBe(0b10);
    sim.command(3, { kind: 'autocast', hero: hero.id, slot: 1, on: false }, 2);
    sim.step();
    expect(heroOf(sim, 3).autocast).toBe(0);
  });
});
