import { describe, expect, it } from 'vitest';
import { defaultGame } from '../../src/content/index.ts';
import type { Command } from '../../src/sim/commands.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { byPlayerThenSeq, Sim } from '../../src/sim/sim.ts';
import { TICK_HZ } from '../../src/sim/time.ts';

interface Scripted {
  readonly tick: number;
  readonly player: number;
  readonly cmd: Command;
}

const HEX16 = /^[0-9a-f]{16}$/u;
// defaultGame(): Ancient 1, gunner 2, tank 3, ranged 4, support 5. Debug spawns start at 6.
const GUNNER = 2;
const TANK = 3;

const SCRIPT: readonly Scripted[] = [
  { tick: 1, player: 0, cmd: { kind: 'spawn', def: 'grunt', x: 70, y: 25 } },
  { tick: 1, player: 1, cmd: { kind: 'spawn', def: 'brute', x: 10, y: 3 } },
  { tick: 2, player: 0, cmd: { kind: 'move', hero: GUNNER, x: 7.3, y: -2.1 } },
  { tick: 5, player: 1, cmd: { kind: 'move', hero: TANK, x: -4, y: 11 } },
  { tick: 40, player: 0, cmd: { kind: 'move', hero: GUNNER, x: 1 / 3, y: 100 } },
  { tick: 41, player: 1, cmd: { kind: 'spawn', def: 'runner', x: 2, y: 2 } },
];

function newSim(seed: number, hashEvery?: number): Sim {
  return hashEvery === undefined
    ? new Sim({ seed, game: defaultGame() })
    : new Sim({ seed, game: defaultGame(), hashEvery });
}

/** Submits the whole script up front (as lockstep would with input delay), then runs. */
function run(seed: number, script: readonly Scripted[], ticks: number): SimEvent[] {
  const sim = newSim(seed);
  for (const s of script) {
    if (!sim.command(s.player, s.cmd, s.tick).ok) {
      throw new Error(`script command rejected at tick ${s.tick}`);
    }
  }
  const events: SimEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    events.push(...sim.step());
  }
  return events;
}

function hashes(events: readonly SimEvent[]): string[] {
  return events.flatMap((e) => (e.kind === 'hash' ? [e.stateHash] : []));
}

function kinds(events: readonly SimEvent[]): string[] {
  return events.map((e) => e.kind);
}

describe('Sim setup', () => {
  it('creates the Ancient, then the lineup in order, and reports it in the first step', () => {
    const sim = newSim(1);
    expect([...sim.entities.values()].map((e) => [e.id, e.kind, e.def, e.team])).toEqual([
      [1, 'ancient', 'ancient', 0],
      [2, 'hero', 'gunner', 0],
      [3, 'hero', 'tank', 0],
      [4, 'hero', 'ranged', 0],
      [5, 'hero', 'support', 0],
    ]);
    expect(sim.entities.get(1)).toMatchObject({ hp: 20, maxHp: 20, x: 90, y: 30 });
    const first = sim.step();
    expect(first.filter((e) => e.kind === 'spawn').map((e) => e.id)).toEqual([1, 2, 3, 4, 5]);
    expect(first[0]).toMatchObject({ tick: 0, kind: 'spawn', def: 'ancient', team: 0 });
  });

  it('converts content units: per-second speed becomes per-tick', () => {
    const sim = newSim(1);
    expect(sim.entities.get(GUNNER)?.speed).toBe(4 / TICK_HZ);
  });
});

describe('Sim ticks', () => {
  it('runs at 30 Hz integer ticks starting from 0', () => {
    const sim = newSim(1);
    expect(TICK_HZ).toBe(30);
    expect(sim.tick).toBe(0);
    sim.step();
    sim.step();
    expect(sim.tick).toBe(2);
  });

  it('emits a hash event every N ticks, last in its tick', () => {
    const sim = newSim(1, 4);
    sim.command(0, { kind: 'spawn', def: 'grunt', x: 0, y: 0 }, 4);
    const perTick = Array.from({ length: 12 }, () => sim.step());
    const withHash = perTick.flatMap((ev) => ev.filter((e) => e.kind === 'hash').map((e) => ({ e, last: ev.at(-1) })));
    expect(withHash.map(({ e }) => e.tick)).toEqual([4, 8, 12]);
    for (const { e, last } of withHash) {
      expect(e).toBe(last);
      expect(e.stateHash).toMatch(HEX16);
    }
    expect(hashes(run(1, [], 90))).toHaveLength(3);
  });

  it('rejects a non-positive hash interval', () => {
    expect(() => newSim(1, 0)).toThrow(RangeError);
  });
});

describe('Sim commands', () => {
  it('applies at the scheduled tick (default next tick) and logs a cmd event', () => {
    const sim = newSim(1);
    sim.step();
    expect(sim.command(0, { kind: 'spawn', def: 'grunt', x: 1, y: 2 })).toEqual({ ok: true, tick: 2, seq: 0 });
    expect(sim.command(0, { kind: 'spawn', def: 'grunt', x: 3, y: 4 }, 4)).toEqual({ ok: true, tick: 4, seq: 1 });
    expect(sim.step()).toEqual([
      { tick: 2, kind: 'cmd', player: 0, cmd: { kind: 'spawn', def: 'grunt', x: 1, y: 2 } },
      { tick: 2, kind: 'spawn', id: 6, def: 'grunt', team: 1 },
    ]);
    expect(sim.step()).toEqual([]);
    expect(kinds(sim.step())).toEqual(['cmd', 'spawn']);
    expect(sim.entities.get(7)).toMatchObject({ x: 3, y: 4, kind: 'enemy' });
  });

  it('rejects commands for ticks already run, without logging them', () => {
    const sim = newSim(1);
    sim.step();
    sim.step();
    expect(sim.command(0, { kind: 'stop', hero: GUNNER }, 2)).toEqual({ ok: false, reason: 'past' });
    expect(sim.command(0, { kind: 'stop', hero: GUNNER }, 0)).toEqual({ ok: false, reason: 'past' });
    expect(sim.step()).toEqual([]);
  });

  it('rejects malformed commands', () => {
    const sim = newSim(1);
    sim.step();
    expect(sim.command(0, { kind: 'move', hero: GUNNER, x: Number.NaN, y: 0 }).ok).toBe(false);
    expect(sim.command(-1, { kind: 'move', hero: GUNNER, x: 0, y: 0 }).ok).toBe(false);
    expect(sim.command(0, { kind: 'move', hero: GUNNER, x: 0, y: 0 }, 2.5).ok).toBe(false);
    expect(sim.command(0, { kind: 'nope' } as unknown as Command).ok).toBe(false);
    expect(sim.step()).toEqual([]);
  });

  it('orders a tick by player, then by that player’s submission order', () => {
    const sim = newSim(1);
    sim.step();
    sim.command(2, { kind: 'spawn', def: 'grunt', x: 20, y: 0 });
    sim.command(0, { kind: 'spawn', def: 'grunt', x: 0, y: 0 });
    sim.command(2, { kind: 'spawn', def: 'grunt', x: 21, y: 0 });
    sim.command(1, { kind: 'spawn', def: 'grunt', x: 10, y: 0 });
    const order = sim.step().flatMap((e) => (e.kind === 'cmd' && e.cmd.kind === 'spawn' ? [e.cmd.x] : []));
    expect(order).toEqual([0, 10, 20, 21]);
    expect([...sim.entities.values()].filter((e) => e.kind === 'enemy').map((e) => e.x)).toEqual([0, 10, 20, 21]);
  });

  it('gives the same result when players’ submissions interleave differently', () => {
    const byPlayer = (p: number): Scripted[] => SCRIPT.filter((s) => s.player === p);
    const interleaved = [...byPlayer(1), ...byPlayer(0)];
    expect(run(9, interleaved, 120)).toEqual(run(9, SCRIPT, 120));
  });

  it('logs and runs its own copy of the command', () => {
    const sim = newSim(1);
    sim.step();
    const cmd = { kind: 'spawn' as const, def: 'grunt', x: 5, y: 5 };
    sim.command(0, cmd);
    cmd.x = 99;
    const ev = sim.step();
    expect(ev[0]).toMatchObject({ cmd: { x: 5 } });
    expect(sim.entities.get(6)?.x).toBe(5);
  });

  it('moves a hero toward the target at its speed and stops on arrival; stop halts it', () => {
    const sim = newSim(1);
    const hero = sim.entities.get(TANK);
    const x0 = hero?.x ?? 0;
    const y0 = hero?.y ?? 0;
    sim.command(0, { kind: 'move', hero: TANK, x: x0 + 3, y: y0 + 4 }, 1);
    sim.command(0, { kind: 'move', hero: 99, x: 3, y: 4 }, 1);
    sim.step();
    expect(hero?.move.mode).toBe('point');
    expect(hero?.x).toBeCloseTo(x0 + (0.6 * 3.5) / TICK_HZ);
    expect(hero?.y).toBeCloseTo(y0 + (0.8 * 3.5) / TICK_HZ);
    for (let i = 0; i < 60; i++) {
      sim.step();
    }
    expect(hero).toMatchObject({ x: x0 + 3, y: y0 + 4, move: { mode: 'idle' } });
    sim.command(0, { kind: 'move', hero: TANK, x: 0, y: 0 });
    sim.step();
    sim.command(0, { kind: 'stop', hero: TANK });
    sim.step();
    const stopped = hero?.x;
    sim.step();
    expect(hero?.x).toBe(stopped);
  });

  it('ignores hero commands for missing entities and non-heroes, but still logs them', () => {
    const sim = newSim(1);
    sim.command(0, { kind: 'move', hero: 1, x: 0, y: 0 }, 1);
    sim.command(0, { kind: 'hold', hero: 99, on: true }, 1);
    const before = sim.hash();
    const ev = sim.step();
    expect(ev.filter((e) => e.kind === 'cmd')).toHaveLength(2);
    expect(sim.entities.get(1)?.move.mode).toBe('idle');
    expect(sim.hash()).not.toBe(before);
  });

  it('debug spawn of an unknown def is a logged no-op', () => {
    const sim = newSim(1);
    sim.command(0, { kind: 'spawn', def: 'nope', x: 0, y: 0 }, 1);
    expect(kinds(sim.step())).toEqual(['spawn', 'spawn', 'spawn', 'spawn', 'spawn', 'cmd']);
    expect(sim.entities.size).toBe(5);
  });

  it('debug spawn of a hero def adds a hero with its kit', () => {
    const sim = newSim(1);
    sim.command(0, { kind: 'spawn', def: 'gunner', x: 1, y: 1 }, 1);
    sim.step();
    expect(sim.entities.get(6)).toMatchObject({ kind: 'hero', def: 'gunner', kit: { kind: 'gunner', hold: false } });
  });
});

describe('Sim determinism', () => {
  it('same seed and script give identical event streams and hash sequences', () => {
    const a = run(42, SCRIPT, 300);
    const b = run(42, SCRIPT, 300);
    expect(hashes(a)).toHaveLength(10);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('two sims in one process do not interfere', () => {
    const a = newSim(42);
    const b = newSim(42);
    for (const s of SCRIPT) {
      a.command(s.player, s.cmd, s.tick);
      b.command(s.player, s.cmd, s.tick);
    }
    for (let i = 0; i < 100; i++) {
      expect(a.step()).toEqual(b.step());
    }
    expect(a.hash()).toBe(b.hash());
  });

  it('a different seed changes every hash', () => {
    const a = hashes(run(42, SCRIPT, 300));
    const b = hashes(run(43, SCRIPT, 300));
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).not.toBe(b[i]);
    }
  });

  it('a changed command changes the hashes from then on', () => {
    const changed = SCRIPT.map((s) =>
      s.tick === 40 && s.cmd.kind === 'move' ? { ...s, cmd: { ...s.cmd, x: 1 / 3 + 1e-12 } } : s,
    );
    const a = hashes(run(42, SCRIPT, 300));
    const b = hashes(run(42, changed, 300));
    expect(b.slice(0, 1)).toEqual(a.slice(0, 1));
    for (let i = 1; i < a.length; i++) {
      expect(b[i]).not.toBe(a[i]);
    }
  });

  it('hash sees exact float bits', () => {
    const a = newSim(1);
    const b = newSim(1);
    const e = b.entities.get(GUNNER);
    if (e === undefined) {
      throw new Error('no gunner');
    }
    e.x = -0;
    const c = newSim(1);
    const f = c.entities.get(GUNNER);
    if (f === undefined) {
      throw new Error('no gunner');
    }
    f.x = 0;
    expect(b.hash()).not.toBe(c.hash());
    expect(a.hash()).not.toBe(b.hash());
  });

  it('hash covers kit state, statuses and move/attack state', () => {
    const base = newSim(1).hash();
    const edits: ((e: NonNullable<ReturnType<Sim['entities']['get']>>) => void)[] = [
      (e) => {
        if (e.kit !== undefined) {
          e.kit.hold = true;
        }
      },
      (e) => {
        e.statuses.push({ status: 'marked', until: 5, src: 1, value: 0.5 });
      },
      (e) => {
        e.move.waypoint = 3;
      },
      (e) => {
        e.attack.cooldown = 2;
      },
      (e) => {
        e.hp -= 1;
      },
      (e) => {
        e.armour += 1;
      },
    ];
    const seen = new Set<string>([base]);
    for (const edit of edits) {
      const sim = newSim(1);
      const hero = sim.entities.get(GUNNER);
      if (hero === undefined) {
        throw new Error('no gunner');
      }
      edit(hero);
      seen.add(sim.hash());
    }
    expect(seen.size).toBe(edits.length + 1);
  });

  it('command() normalises -0, so logged commands survive JSON', () => {
    const a = newSim(1);
    const b = newSim(1);
    a.command(0, { kind: 'move', hero: GUNNER, x: 0, y: 0 });
    b.command(0, { kind: 'move', hero: GUNNER, x: -0, y: -0 });
    expect(b.step()).toEqual(a.step());
    expect(b.hash()).toBe(a.hash());
  });
});

describe('byPlayerThenSeq', () => {
  it('orders by player, then by seq, whatever the input order', () => {
    const input = [
      { player: 2, seq: 0 },
      { player: 0, seq: 2 },
      { player: 1, seq: 1 },
      { player: 0, seq: 0 },
      { player: 1, seq: 0 },
      { player: 0, seq: 1 },
    ];
    expect([...input].sort(byPlayerThenSeq)).toEqual([
      { player: 0, seq: 0 },
      { player: 0, seq: 1 },
      { player: 0, seq: 2 },
      { player: 1, seq: 0 },
      { player: 1, seq: 1 },
      { player: 2, seq: 0 },
    ]);
    expect([...input].reverse().sort(byPlayerThenSeq)).toEqual([...input].sort(byPlayerThenSeq));
  });
});
