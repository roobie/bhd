// Intents board lifecycle (src/intents/board.ts): specced engine behaviour only (D-4E4QRJ7N6LIGZDSD).
// The rig has four Gunners (ids 2..5) so any hero can poster or reserve; slot 2 (Pavise) is
// used for casts and its cooldown is the "on cooldown" lever. Whether a cast went through is read
// from `ability` events, never assumed.

import { describe, expect, it } from 'vitest';
import { gunnerDef } from '../../src/content/heroes/gunner.ts';
import type { GameConfig } from '../../src/content/index.ts';
import { defaultGame } from '../../src/content/index.ts';
import type { Command } from '../../src/sim/commands.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { stateHash } from '../../src/sim/hash.ts';
import type { GunnerState } from '../../src/sim/heroes/gunner.ts';
import { Sim } from '../../src/sim/sim.ts';
import { ticks } from '../../src/sim/time.ts';

const SLOT = 2;
const HEROES = [2, 3, 4, 5];

function rigGame(over: { maxLive?: number } = {}): GameConfig {
  const base = defaultGame();
  const heroes = HEROES.map((_, i) => ({ ...gunnerDef(), id: `gunner${i}` }));
  return {
    ...base,
    heroes,
    waves: { ...base.waves, firstDelay: 100_000 },
    intents: { ...base.intents, maxLive: over.maxLive ?? base.intents.maxLive },
  };
}

interface Rig {
  readonly sim: Sim;
  readonly events: SimEvent[];
  /** Queues `cmd` to apply on `tick`. */
  readonly at: (tick: number, cmd: Command) => void;
  readonly runTo: (tick: number) => void;
  readonly post: (tick: number, hero: number, fireIn: number) => void;
  readonly reserve: (tick: number, hero: number, intent: number, offset: number) => void;
  readonly cancel: (tick: number, hero: number, intent: number) => void;
  /** `[tick, op, id, by]` of every intent event so far. */
  readonly ops: () => [number, string, number, number][];
  /** Ticks of `ability` events for `hero`. */
  readonly casts: (hero: number) => number[];
}

function rig(game = rigGame()): Rig {
  const sim = new Sim({ seed: 1, game });
  const events: SimEvent[] = [];
  const at = (tick: number, cmd: Command): void => {
    if (!sim.command(0, cmd, tick).ok) {
      throw new Error('command rejected');
    }
  };
  return {
    sim,
    events,
    at,
    runTo: (tick) => {
      while (sim.tick < tick) {
        events.push(...sim.step());
      }
    },
    post: (tick, hero, fireIn) => {
      at(tick, { kind: 'intent', op: 'post', hero, slot: SLOT, intentKind: 'pull', x: 20, y: 20, fireIn });
    },
    reserve: (tick, hero, intent, offset) => {
      at(tick, { kind: 'intent', op: 'reserve', hero, intent, slot: SLOT, offset });
    },
    cancel: (tick, hero, intent) => {
      at(tick, { kind: 'intent', op: 'cancel', hero, intent });
    },
    ops: () =>
      events.flatMap((e) =>
        e.kind === 'intent' ? [[e.tick, e.op, e.id, e.by] as [number, string, number, number]] : [],
      ),
    casts: (hero) => events.flatMap((e) => (e.kind === 'ability' && e.hero === hero ? [e.tick] : [])),
  };
}

function gunnerKit(r: Rig, id: number): GunnerState {
  const kit = r.sim.entities.get(id)?.kit;
  if (kit?.kind !== 'gunner') {
    throw new Error('not a gunner');
  }
  return kit;
}

describe('post and fire', () => {
  it('fires at applyTick + fireIn through ctx.cast, then leaves the board', () => {
    const r = rig();
    r.post(10, 2, 5);
    r.runTo(30);
    expect(r.ops()).toEqual([
      [10, 'post', 1, 2],
      [15, 'fire', 1, 2],
    ]);
    expect(r.casts(2)).toContain(15);
    expect(r.sim.intents.live).toEqual([]);
    expect(r.sim.intents.nextId).toBe(2);
  });

  it('ids are monotonic and never reused', () => {
    const r = rig();
    r.post(3, 2, 1);
    r.post(3, 3, 1);
    r.runTo(5);
    r.post(6, 2, 1);
    r.runTo(10);
    expect(
      r
        .ops()
        .filter(([, op]) => op === 'post')
        .map(([, , id]) => id),
    ).toEqual([1, 2, 3]);
  });

  it('refuses a second pending post by the same hero, but allows one once the first fired', () => {
    const r = rig();
    r.post(3, 2, 10);
    r.post(4, 2, 10);
    r.runTo(5);
    expect(r.ops().filter(([, op]) => op === 'post')).toHaveLength(1);
    r.runTo(14);
    r.post(15, 2, 3);
    r.runTo(16);
    expect(r.ops().filter(([, op]) => op === 'post')).toHaveLength(2);
  });

  it('refuses posts beyond intents.maxLive', () => {
    const r = rig(rigGame({ maxLive: 2 }));
    r.post(3, 2, 10);
    r.post(3, 3, 10);
    r.post(3, 4, 10);
    r.runTo(4);
    expect(
      r
        .ops()
        .filter(([, op]) => op === 'post')
        .map(([, , , by]) => by),
    ).toEqual([2, 3]);
    expect(r.sim.intents.nextId).toBe(3);
    expect(r.events.some((e) => e.kind === 'cmd')).toBe(true);
  });

  it('refuses posts by a missing, non-hero or dead hero', () => {
    const r = rig();
    const dead = r.sim.entities.get(5);
    if (dead === undefined) {
      throw new Error('no hero');
    }
    dead.hp = 0;
    r.post(3, 99, 5);
    r.post(3, 1, 5); // the Ancient
    r.post(3, 5, 5);
    r.runTo(4);
    expect(r.ops()).toEqual([]);
    expect(r.sim.intents.nextId).toBe(1);
  });

  it('expires (not fires) when the poster is on cooldown at the fire tick', () => {
    const r = rig();
    r.post(3, 2, 5);
    r.runTo(4);
    gunnerKit(r, 2).cdPavise = 1000;
    r.runTo(10);
    expect(r.ops()).toEqual([
      [3, 'post', 1, 2],
      [8, 'expire', 1, 2],
    ]);
    expect(r.casts(2)).not.toContain(8);
    expect(r.sim.intents.live).toEqual([]);
  });

  it('expires when the poster dies before the fire tick', () => {
    const r = rig();
    r.post(3, 2, 10);
    r.runTo(6);
    const hero = r.sim.entities.get(2);
    if (hero === undefined) {
      throw new Error('no hero');
    }
    hero.hp = 0;
    r.runTo(20);
    const ops = r.ops();
    expect(ops).toEqual([
      [3, 'post', 1, 2],
      [13, 'expire', 1, 2],
    ]);
    expect(r.casts(2)).toEqual([]);
    expect(r.sim.intents.live).toEqual([]);
  });
});

describe('reservations', () => {
  it('fulfils at fireTick + offset by the reserver', () => {
    const r = rig();
    r.post(3, 2, 10); // fires 13
    r.reserve(5, 3, 1, 4);
    r.runTo(30);
    expect(r.ops()).toEqual([
      [3, 'post', 1, 2],
      [5, 'reserve', 1, 3],
      [13, 'fire', 1, 2],
      [17, 'fulfil', 1, 3],
    ]);
    expect(r.casts(3)).toEqual([17]);
    expect(r.sim.intents.live).toEqual([]);
  });

  it('keeps the intent after it fired until its last reservation resolves, offset 0 resolving on the fire tick', () => {
    const r = rig();
    r.post(3, 2, 10);
    r.reserve(4, 3, 1, 0);
    r.reserve(4, 4, 1, 6);
    r.runTo(14);
    expect(r.sim.intents.live).toHaveLength(1);
    expect(r.ops().slice(-2)).toEqual([
      [13, 'fire', 1, 2],
      [13, 'fulfil', 1, 3],
    ]);
    r.runTo(19);
    expect(r.ops().at(-1)).toEqual([19, 'fulfil', 1, 4]);
    expect(r.sim.intents.live).toEqual([]);
  });

  it('accepts offset up to maxOffsetSeconds and refuses more', () => {
    const r = rig();
    const max = ticks(defaultGame().intents.maxOffsetSeconds);
    r.post(3, 2, 10);
    r.reserve(4, 3, 1, max);
    r.reserve(4, 4, 1, max + 1);
    r.runTo(5);
    expect(
      r
        .ops()
        .filter(([, op]) => op === 'reserve')
        .map(([, , , by]) => by),
    ).toEqual([3]);
  });

  it('refuses reservations that are late, duplicate, on the own intent, unknown, or by a missing or dead hero', () => {
    const r = rig();
    const dead = r.sim.entities.get(5);
    if (dead === undefined) {
      throw new Error('no hero');
    }
    dead.hp = 0;
    r.post(3, 2, 10); // fires 13
    r.reserve(4, 3, 1, 2);
    r.reserve(4, 3, 1, 3); // duplicate
    r.reserve(4, 2, 1, 2); // own intent
    r.reserve(4, 4, 7, 2); // unknown intent
    r.reserve(4, 99, 1, 2); // missing hero
    r.reserve(4, 5, 1, 2); // dead hero
    r.reserve(13, 4, 1, 2); // at fireTick: too late
    r.runTo(12);
    expect(
      r
        .ops()
        .filter(([, op]) => op === 'reserve')
        .map(([, , , by]) => by),
    ).toEqual([3]);
    r.runTo(13);
    expect(r.ops().filter(([, op]) => op === 'reserve')).toHaveLength(1);
    r.reserve(14, 4, 1, 2); // after it fired
    r.runTo(15);
    expect(r.ops().filter(([, op]) => op === 'reserve')).toHaveLength(1);
  });

  it('expires at once-resolvable time when the poster failed: at fireTick + offset, intent lingering until then', () => {
    const r = rig();
    r.post(3, 2, 5); // fires 8
    r.reserve(4, 3, 1, 5);
    r.runTo(4);
    gunnerKit(r, 2).cdPavise = 1000;
    r.runTo(9);
    expect(r.ops()).toEqual([
      [3, 'post', 1, 2],
      [4, 'reserve', 1, 3],
      [8, 'expire', 1, 2],
    ]);
    expect(r.sim.intents.live).toHaveLength(1);
    r.runTo(13);
    expect(r.ops().at(-1)).toEqual([13, 'expire', 1, 3]);
    expect(r.casts(3)).toEqual([]);
    expect(r.sim.intents.live).toEqual([]);
  });

  it('expires when the reserver is on cooldown at its cast tick', () => {
    const r = rig();
    r.post(3, 2, 5);
    r.reserve(4, 3, 1, 2);
    r.runTo(5);
    gunnerKit(r, 3).cdPavise = 1000;
    r.runTo(20);
    expect(r.ops().slice(-2)).toEqual([
      [8, 'fire', 1, 2],
      [10, 'expire', 1, 3],
    ]);
    expect(r.casts(3)).toEqual([]);
  });

  it('expires when the reserver is dead at its cast tick', () => {
    const r = rig();
    r.post(3, 2, 5);
    r.reserve(4, 3, 1, 2);
    r.runTo(5);
    const hero = r.sim.entities.get(3);
    if (hero === undefined) {
      throw new Error('no hero');
    }
    hero.hp = 0;
    r.runTo(20);
    expect(r.ops().at(-1)).toEqual([10, 'expire', 1, 3]);
    expect(r.casts(3)).toEqual([]);
    expect(r.sim.intents.live).toEqual([]);
  });

  it('expires when the reserver cast the ability early (no lock)', () => {
    const r = rig();
    r.post(3, 2, 10);
    r.reserve(4, 3, 1, 2);
    r.at(6, { kind: 'ability', hero: 3, slot: SLOT, x: 1, y: 1 });
    r.runTo(20);
    expect(r.casts(3)).toEqual([6]);
    expect(r.ops().at(-1)).toEqual([15, 'expire', 1, 3]);
  });
});

describe('cancel', () => {
  it('lets the poster cancel before fireTick: cancel, then its reservations expire, intent removed', () => {
    const r = rig();
    r.post(3, 2, 10);
    r.reserve(4, 4, 1, 2);
    r.reserve(4, 3, 1, 2);
    r.cancel(12, 2, 1);
    r.runTo(30);
    expect(r.ops()).toEqual([
      [3, 'post', 1, 2],
      [4, 'reserve', 1, 4],
      [4, 'reserve', 1, 3],
      [12, 'cancel', 1, 2],
      [12, 'expire', 1, 3],
      [12, 'expire', 1, 4],
    ]);
    expect(r.sim.intents.live).toEqual([]);
    expect(r.casts(2)).toEqual([]);
  });

  it('refuses a poster cancel at or after fireTick, and by a stranger', () => {
    const r = rig();
    r.post(3, 2, 10); // fires 13
    r.cancel(5, 4, 1); // stranger
    r.cancel(13, 2, 1); // at fireTick
    r.cancel(20, 2, 1); // gone
    r.runTo(25);
    expect(r.ops().map(([, op]) => op)).toEqual(['post', 'fire']);
  });

  it('lets a reserver cancel its own reservation, before or after the intent fired', () => {
    const r = rig();
    r.post(3, 2, 10);
    r.reserve(4, 3, 1, 5);
    r.reserve(4, 4, 1, 8);
    r.cancel(6, 3, 1);
    r.cancel(14, 4, 1); // fired, reservation still armed
    r.runTo(30);
    expect(r.ops()).toEqual([
      [3, 'post', 1, 2],
      [4, 'reserve', 1, 3],
      [4, 'reserve', 1, 4],
      [6, 'cancel', 1, 3],
      [13, 'fire', 1, 2],
      [14, 'cancel', 1, 4],
    ]);
    expect(r.casts(3)).toEqual([]);
    expect(r.casts(4)).toEqual([]);
    expect(r.sim.intents.live).toEqual([]);
  });

  it('keeps a pending intent when its last reservation is cancelled', () => {
    const r = rig();
    r.post(3, 2, 10);
    r.reserve(4, 3, 1, 5);
    r.cancel(5, 3, 1);
    r.runTo(8);
    expect(r.sim.intents.live).toHaveLength(1);
    r.runTo(13);
    expect(r.ops().at(-1)).toEqual([13, 'fire', 1, 2]);
  });

  it("refuses cancelling an unknown intent or someone else's reservation", () => {
    const r = rig();
    r.post(3, 2, 10);
    r.reserve(4, 3, 1, 5);
    r.cancel(5, 3, 9);
    r.cancel(5, 4, 1);
    r.runTo(6);
    expect(r.ops().map(([, op]) => op)).toEqual(['post', 'reserve']);
    expect(r.sim.intents.live[0]?.reservations).toHaveLength(1);
  });
});

describe('op order within a tick', () => {
  it('resolves ascending intent id, the poster first, then reservations ascending by hero id', () => {
    const r = rig();
    r.post(3, 3, 10); // intent 1, fires 13
    r.post(3, 2, 10); // intent 2, fires 13
    // Reserve in descending hero order; both offsets land on tick 15.
    r.reserve(4, 5, 1, 2);
    r.reserve(4, 4, 1, 2);
    r.reserve(4, 5, 2, 2);
    r.reserve(4, 4, 2, 2);
    r.runTo(20);
    const resolved = r
      .ops()
      .filter(([tick]) => tick >= 13)
      .map(([tick, , id, by]) => [tick, id, by, by === (id === 1 ? 3 : 2) ? 'poster' : 'reserver']);
    expect(resolved).toEqual([
      [13, 1, 3, 'poster'],
      [13, 2, 2, 'poster'],
      [15, 1, 4, 'reserver'],
      [15, 1, 5, 'reserver'],
      [15, 2, 4, 'reserver'],
      [15, 2, 5, 'reserver'],
    ]);
    const reserves = r.ops().filter(([, op]) => op === 'reserve');
    expect(reserves.map(([, , id, by]) => [id, by])).toEqual([
      [1, 5],
      [1, 4],
      [2, 5],
      [2, 4],
    ]);
    expect(r.sim.intents.live).toEqual([]);
  });

  it('applies commands before the phase: a post with fireIn 1 fires next tick, a same-tick cancel wins', () => {
    const r = rig();
    r.post(5, 2, 1);
    r.post(5, 3, 1);
    r.cancel(5, 3, 2);
    r.runTo(8);
    expect(r.ops()).toEqual([
      [5, 'post', 1, 2],
      [5, 'post', 2, 3],
      [5, 'cancel', 2, 3],
      [6, 'fire', 1, 2],
    ]);
  });

  it('is deterministic: the same script gives the same events and hashes', () => {
    const run = (): { ops: unknown; hash: string } => {
      const r = rig();
      r.post(3, 2, 6);
      r.reserve(4, 3, 1, 3);
      r.reserve(4, 4, 1, 1);
      r.post(5, 5, 20);
      r.cancel(6, 4, 1);
      r.runTo(40);
      return { ops: r.ops(), hash: r.sim.hash() };
    };
    expect(run()).toEqual(run());
  });
});

describe('board state is hashed', () => {
  type Tree = Record<string, unknown>;

  function built(): Rig {
    const r = rig();
    r.post(3, 2, 30);
    r.post(3, 3, 40);
    r.reserve(4, 4, 1, 6);
    r.runTo(5);
    return r;
  }

  function hashOf(r: Rig): string {
    return stateHash({
      tick: 5,
      ended: false,
      entities: r.sim.entities,
      waves: r.sim.waves,
      rng: r.sim.rng,
      intents: r.sim.intents,
      master: r.sim.master,
    });
  }

  function leaves(node: unknown, prefix: string[], out: string[][]): void {
    if (Array.isArray(node)) {
      node.forEach((child, i) => {
        leaves(child, [...prefix, String(i)], out);
      });
    } else if (typeof node === 'object' && node !== null) {
      for (const [k, v] of Object.entries(node)) {
        leaves(v, [...prefix, k], out);
      }
    } else {
      out.push(prefix);
    }
  }

  function perturb(root: Tree, path: string[]): void {
    const parent = path.slice(0, -1).reduce<Tree>((n, k) => n[k] as Tree, root);
    const key = path.at(-1) ?? '';
    const v = parent[key];
    if (typeof v === 'number') {
      parent[key] = v + 1;
    } else if (typeof v === 'boolean') {
      parent[key] = !v;
    } else {
      parent[key] = `${String(v)}x`;
    }
  }

  it('changes when any leaf of a board built by the real lifecycle changes', () => {
    const base = hashOf(built());
    expect(hashOf(built())).toBe(base);
    const paths: string[][] = [];
    leaves(built().sim.intents, [], paths);
    expect(paths.map((p) => p.join('.'))).toEqual(
      expect.arrayContaining([
        'nextId',
        'live.0.id',
        'live.0.by',
        'live.0.slot',
        'live.0.intentKind',
        'live.0.x',
        'live.0.y',
        'live.0.fireTick',
        'live.0.fired',
        'live.0.reservations.0.hero',
        'live.0.reservations.0.slot',
        'live.0.reservations.0.offset',
        'live.1.fireTick',
      ]),
    );
    for (const path of paths) {
      const r = built();
      perturb(r.sim.intents as unknown as Tree, path);
      expect(hashOf(r), path.join('.')).not.toBe(base);
    }
  });

  it('changes when an intent or reservation is added or removed', () => {
    const base = hashOf(built());
    const removed = built();
    removed.sim.intents.live.pop();
    expect(hashOf(removed)).not.toBe(base);
    const unreserved = built();
    const [first] = unreserved.sim.intents.live;
    if (first === undefined) {
      throw new Error('no intent');
    }
    first.reservations = [];
    expect(hashOf(unreserved)).not.toBe(base);
  });
});
