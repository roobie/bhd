import { describe, expect, it } from 'vitest';
import { defaultGame, validateGame } from '../../src/content/index.ts';
import { createMods } from '../../src/sim/bargains.ts';
import { heal } from '../../src/sim/combat.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { heroHooks } from '../../src/sim/heroes/index.ts';
import { Sim } from '../../src/sim/sim.ts';
import { effectiveSpeed, removeStatus } from '../../src/sim/statuses.ts';

const LANE_RE = /lane/u;
const DUP_UNIT_RE = /duplicate unit id 'gunner'/u;
const DUP_STATUS_RE = /duplicate status/u;
const GUNNER = 2;
const TANK = 3;
const RANGED = 4;

type Ctx = Parameters<typeof heal>[0];

function rig(): { sim: Sim; events: SimEvent[]; ctx: Ctx } {
  const sim = new Sim({ seed: 1, game: defaultGame() });
  const events: SimEvent[] = [];
  const ctx: Ctx = {
    tick: 10,
    entities: sim.entities,
    seed: 1,
    rng: sim.rng,
    hooks: heroHooks,
    emit: (e) => {
      events.push(e);
    },
    game: sim.game,
    waves: sim.waves,
    intents: sim.intents,
    master: sim.master,
    bargains: sim.bargains,
    mods: createMods(sim.game, sim.bargains),
    cast: () => false,
    ancientId: 1,
    killers: new Map(),
    end: () => undefined,
  };
  return { sim, events, ctx };
}

function hero(sim: Sim, id: number): NonNullable<ReturnType<Sim['entities']['get']>> {
  const e = sim.entities.get(id);
  if (e === undefined) {
    throw new Error(`no entity ${id}`);
  }
  return e;
}

describe('heal', () => {
  it('restores hp, caps at maxHp, emits heal with the amount actually healed', () => {
    const { sim, events, ctx } = rig();
    // The gunner, not the Penitent (heals on him are scaled by his kit).
    const target = hero(sim, GUNNER);
    target.hp = target.maxHp - 50;
    expect(heal(ctx, { src: 5, dst: GUNNER, amount: 30, tags: [] })).toBe(30);
    expect(heal(ctx, { src: 5, dst: GUNNER, amount: 100, tags: [] })).toBe(20);
    expect(target.hp).toBe(target.maxHp);
    expect(heal(ctx, { src: 5, dst: GUNNER, amount: 10, tags: [] })).toBe(0);
    expect(events).toEqual([
      { tick: 10, kind: 'heal', src: 5, dst: GUNNER, amount: 30 },
      { tick: 10, kind: 'heal', src: 5, dst: GUNNER, amount: 20 },
    ]);
  });

  it('is a no-op on dead, missing or non-positive', () => {
    const { sim, events, ctx } = rig();
    hero(sim, TANK).hp = 0;
    expect(heal(ctx, { src: 5, dst: TANK, amount: 10, tags: [] })).toBe(0);
    expect(heal(ctx, { src: 5, dst: 99, amount: 10, tags: [] })).toBe(0);
    hero(sim, GUNNER).hp = 10;
    expect(heal(ctx, { src: 5, dst: GUNNER, amount: -5, tags: [] })).toBe(0);
    expect(events).toEqual([]);
  });
});

describe('removeStatus', () => {
  it('removes matching instances, optionally only from one src, emitting status off', () => {
    const { sim, events, ctx } = rig();
    const tank = hero(sim, TANK);
    tank.statuses.push(
      { status: 'marked', until: 50, src: 2, value: 1 },
      { status: 'marked', until: 50, src: 4, value: 1 },
      { status: 'taunted', until: 50, src: 5, value: 0 },
    );
    removeStatus(ctx, TANK, 'marked', 4);
    expect(tank.statuses.map((s) => [s.status, s.src])).toEqual([
      ['marked', 2],
      ['taunted', 5],
    ]);
    removeStatus(ctx, TANK, 'marked');
    removeStatus(ctx, 99, 'marked');
    expect(tank.statuses.map((s) => s.status)).toEqual(['taunted']);
    expect(events).toEqual([
      { tick: 10, kind: 'status', dst: TANK, status: 'marked', on: false, src: 4 },
      { tick: 10, kind: 'status', dst: TANK, status: 'marked', on: false, src: 2 },
    ]);
  });
});

describe('rooted', () => {
  it('zeroes effective speed and blocks move commands', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    const g = hero(sim, GUNNER);
    const { x, y } = g;
    expect(effectiveSpeed(g)).toBeGreaterThan(0);
    g.statuses.push({ status: 'rooted', until: 1000, src: GUNNER, value: 0 });
    expect(effectiveSpeed(g)).toBe(0);
    sim.command(0, { kind: 'move', hero: GUNNER, x: x - 10, y }, 1);
    for (let i = 0; i < 10; i++) {
      sim.step();
    }
    expect(g).toMatchObject({ x, y, move: { mode: 'idle' } });
  });

  it('moving resumes once the root is removed', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    const g = hero(sim, GUNNER);
    g.statuses.push({ status: 'rooted', until: 3, src: GUNNER, value: 0 });
    sim.command(0, { kind: 'move', hero: GUNNER, x: g.x - 10, y: g.y }, 5);
    for (let i = 0; i < 10; i++) {
      sim.step();
    }
    expect(g.x).toBeLessThan(80);
  });
});

describe('taunt aggro', () => {
  function enemyAt(sim: Sim, x: number): NonNullable<ReturnType<Sim['entities']['get']>> {
    sim.command(0, { kind: 'spawn', def: 'grunt', x, y: 28 }, 1);
    sim.step();
    return hero(sim, 6);
  }

  it('targets the nearest hostile without taunt', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    sim.command(0, { kind: 'hold', hero: GUNNER, on: true }, 1);
    const e = enemyAt(sim, 79);
    sim.step();
    expect(e.attack.target).toBe(GUNNER);
  });

  it('prefers a live taunter, the longest-lasting taunt if several', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    const e = enemyAt(sim, 79);
    e.statuses.push(
      { status: 'taunted', until: 100, src: 4, value: 0 },
      { status: 'taunted', until: 200, src: TANK, value: 0 },
    );
    sim.step();
    expect(e.attack.target).toBe(TANK);
  });

  it('ignores a dead taunter and an expired taunt', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    const e = enemyAt(sim, 79);
    e.statuses.push({ status: 'taunted', until: 500, src: TANK, value: 0 });
    hero(sim, TANK).hp = 0;
    sim.step();
    expect(e.attack.target).not.toBe(TANK);
  });
});

describe('dead actors', () => {
  // Note: the Gunner's old invariant (a 0-damage hit starts no cooldown) was intentionally dropped:
  // the Gunner always banks its shot period, whatever the hit dealt. Only the stub kit below keeps it.
  it('a 0-hp hero does not attack, and a kit does not start a cooldown on a 0-damage hit', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    hero(sim, GUNNER).hp = 0;
    sim.command(0, { kind: 'spawn', def: 'grunt', x: 76, y: 28 }, 1);
    const dmg = [...sim.step(), ...sim.step()].filter((e) => e.kind === 'dmg' && e.src === GUNNER);
    expect(dmg).toEqual([]);
  });

  it('a stub kit keeps its cooldown at 0 when the hit deals nothing', () => {
    const game = defaultGame();
    const sim = new Sim({
      seed: 1,
      game: { ...game, heroes: game.heroes.map((h) => ({ ...h, attack: { ...h.attack, damage: 0 } })) },
    });
    sim.command(0, { kind: 'spawn', def: 'grunt', x: 76, y: 28 }, 1);
    sim.step();
    expect(hero(sim, RANGED).attack.cooldown).toBe(0);
  });
});

describe('shared kit state', () => {
  it('hold and autocast are set by commandHero for every kit', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    sim.command(0, { kind: 'autocast', hero: GUNNER, slot: 1, on: true }, 1);
    sim.command(0, { kind: 'autocast', hero: GUNNER, slot: 3, on: true }, 1);
    sim.command(0, { kind: 'autocast', hero: GUNNER, slot: 1, on: false }, 2);
    sim.command(0, { kind: 'autocast', hero: TANK, slot: 0, on: true }, 1);
    sim.command(0, { kind: 'hold', hero: TANK, on: true }, 1);
    sim.step();
    expect(hero(sim, GUNNER).kit).toMatchObject({ autocast: 0b1010, hold: false });
    expect(hero(sim, TANK).kit).toMatchObject({ autocast: 1, hold: true });
    sim.step();
    expect(hero(sim, GUNNER).kit).toMatchObject({ autocast: 0b1000 });
  });

  it('autocast changes the hash', () => {
    const a = new Sim({ seed: 1, game: defaultGame() });
    const b = new Sim({ seed: 1, game: defaultGame() });
    b.command(0, { kind: 'autocast', hero: GUNNER, slot: 0, on: true }, 1);
    a.step();
    b.step();
    expect(a.hash()).not.toBe(b.hash());
  });
});

describe('GameConfig validation', () => {
  it('rejects non-finite numbers anywhere', () => {
    const game = defaultGame();
    const bad = { ...game, map: { ...game.map, lane: [{ x: 0, y: Number.NaN }, ...game.map.lane] } };
    expect(() => validateGame(bad)).toThrow(RangeError);
    expect(() => new Sim({ seed: 1, game: bad })).toThrow(LANE_RE);
    const inf = { ...game, enemies: game.enemies.map((e) => ({ ...e, speed: Number.POSITIVE_INFINITY })) };
    expect(() => new Sim({ seed: 1, game: inf })).toThrow(RangeError);
  });

  it('rejects duplicate ids across enemy and hero defs, and duplicate statuses', () => {
    const game = defaultGame();
    const [grunt] = game.enemies;
    if (grunt === undefined) {
      throw new Error('no enemy');
    }
    expect(
      () => new Sim({ seed: 1, game: { ...game, enemies: [...game.enemies, { ...grunt, id: 'gunner' }] } }),
    ).toThrow(DUP_UNIT_RE);
    expect(() => new Sim({ seed: 1, game: { ...game, statuses: [...game.statuses, ...game.statuses] } })).toThrow(
      DUP_STATUS_RE,
    );
  });

  it('accepts the default game', () => {
    expect(() => validateGame(defaultGame())).not.toThrow();
  });
});
