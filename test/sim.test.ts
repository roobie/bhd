import { describe, expect, it } from 'vitest';
import type { Command } from '../src/sim/commands.ts';
import type { SimEvent } from '../src/sim/events.ts';
import { Sim, TICK_HZ } from '../src/sim/sim.ts';

interface Scripted {
  readonly tick: number;
  readonly player: number;
  readonly cmd: Command;
}

const HEX16 = /^[0-9a-f]{16}$/u;

const SCRIPT: readonly Scripted[] = [
  { tick: 1, player: 0, cmd: { kind: 'spawn', type: 'dummy', x: 0, y: 0 } },
  { tick: 1, player: 1, cmd: { kind: 'spawn', type: 'dummy', x: 10, y: 3 } },
  { tick: 2, player: 0, cmd: { kind: 'move', entity: 1, x: 7.3, y: -2.1 } },
  { tick: 5, player: 1, cmd: { kind: 'move', entity: 2, x: -4, y: 11 } },
  { tick: 40, player: 0, cmd: { kind: 'move', entity: 1, x: 1 / 3, y: 100 } },
  { tick: 41, player: 1, cmd: { kind: 'spawn', type: 'dummy', x: 2, y: 2 } },
];

/** Submits the whole script up front (as lockstep would with input delay), then runs. */
function run(seed: number, script: readonly Scripted[], ticks: number): SimEvent[] {
  const sim = new Sim({ seed });
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

describe('Sim ticks', () => {
  it('runs at 30 Hz integer ticks starting from 0', () => {
    const sim = new Sim({ seed: 1 });
    expect(TICK_HZ).toBe(30);
    expect(sim.tick).toBe(0);
    sim.step();
    sim.step();
    expect(sim.tick).toBe(2);
  });

  it('emits a hash event every N ticks, last in its tick', () => {
    const sim = new Sim({ seed: 1, hashEvery: 4 });
    sim.command(0, { kind: 'spawn', type: 'dummy', x: 0, y: 0 }, 4);
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
    expect(() => new Sim({ seed: 1, hashEvery: 0 })).toThrow(RangeError);
  });
});

describe('Sim commands', () => {
  it('applies at the scheduled tick (default next tick) and logs a cmd event', () => {
    const sim = new Sim({ seed: 1 });
    expect(sim.command(0, { kind: 'spawn', type: 'dummy', x: 1, y: 2 })).toEqual({ ok: true, tick: 1, seq: 0 });
    expect(sim.command(0, { kind: 'spawn', type: 'dummy', x: 3, y: 4 }, 3)).toEqual({ ok: true, tick: 3, seq: 1 });
    expect(sim.step()).toEqual([
      { tick: 1, kind: 'cmd', player: 0, cmd: { kind: 'spawn', type: 'dummy', x: 1, y: 2 } },
      { tick: 1, kind: 'spawn', id: 1, type: 'dummy' },
    ]);
    expect(sim.step()).toEqual([]);
    expect(sim.step().map((e) => e.kind)).toEqual(['cmd', 'spawn']);
    expect(sim.entities.get(2)).toMatchObject({ x: 3, y: 4 });
  });

  it('rejects commands for ticks already run, without logging them', () => {
    const sim = new Sim({ seed: 1 });
    sim.step();
    sim.step();
    expect(sim.command(0, { kind: 'spawn', type: 'dummy', x: 0, y: 0 }, 2)).toEqual({ ok: false, reason: 'past' });
    expect(sim.command(0, { kind: 'spawn', type: 'dummy', x: 0, y: 0 }, 0)).toEqual({ ok: false, reason: 'past' });
    expect(sim.step()).toEqual([]);
  });

  it('rejects malformed commands', () => {
    const sim = new Sim({ seed: 1 });
    expect(sim.command(0, { kind: 'move', entity: 1, x: Number.NaN, y: 0 }).ok).toBe(false);
    expect(sim.command(-1, { kind: 'move', entity: 1, x: 0, y: 0 }).ok).toBe(false);
    expect(sim.command(0, { kind: 'move', entity: 1, x: 0, y: 0 }, 1.5).ok).toBe(false);
    expect(sim.command(0, { kind: 'nope' } as unknown as Command).ok).toBe(false);
    expect(sim.step()).toEqual([]);
  });

  it('orders a tick by player, then by that player’s submission order', () => {
    const sim = new Sim({ seed: 1 });
    sim.command(2, { kind: 'spawn', type: 'dummy', x: 20, y: 0 });
    sim.command(0, { kind: 'spawn', type: 'dummy', x: 0, y: 0 });
    sim.command(2, { kind: 'spawn', type: 'dummy', x: 21, y: 0 });
    sim.command(1, { kind: 'spawn', type: 'dummy', x: 10, y: 0 });
    const order = sim.step().flatMap((e) => (e.kind === 'cmd' && e.cmd.kind === 'spawn' ? [e.cmd.x] : []));
    expect(order).toEqual([0, 10, 20, 21]);
    expect([...sim.entities.values()].map((e) => e.x)).toEqual([0, 10, 20, 21]);
  });

  it('gives the same result when players’ submissions interleave differently', () => {
    const byPlayer = (p: number): Scripted[] => SCRIPT.filter((s) => s.player === p);
    const interleaved = [...byPlayer(1), ...byPlayer(0)];
    expect(run(9, interleaved, 120)).toEqual(run(9, SCRIPT, 120));
  });

  it('logs and runs its own copy of the command', () => {
    const sim = new Sim({ seed: 1 });
    const cmd = { kind: 'spawn' as const, type: 'dummy' as const, x: 5, y: 5 };
    sim.command(0, cmd);
    cmd.x = 99;
    const ev = sim.step();
    expect(ev[0]).toMatchObject({ cmd: { x: 5 } });
    expect(sim.entities.get(1)?.x).toBe(5);
  });

  it('moves toward the target at fixed speed and stops on arrival', () => {
    const sim = new Sim({ seed: 1 });
    sim.command(0, { kind: 'spawn', type: 'dummy', x: 0, y: 0 }, 1);
    sim.command(0, { kind: 'move', entity: 1, x: 3, y: 4 }, 2);
    sim.command(0, { kind: 'move', entity: 99, x: 3, y: 4 }, 2);
    sim.step();
    sim.step();
    const e = sim.entities.get(1);
    expect(e?.x).toBeCloseTo(0.15);
    expect(e?.y).toBeCloseTo(0.2);
    for (let i = 0; i < 30; i++) {
      sim.step();
    }
    expect(e).toMatchObject({ x: 3, y: 4, moving: false });
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
    const a = new Sim({ seed: 42 });
    const b = new Sim({ seed: 42 });
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
    const changed = SCRIPT.map((s) => (s.tick === 40 ? { ...s, cmd: { ...s.cmd, x: 1 / 3 + 1e-12 } } : s));
    const a = hashes(run(42, SCRIPT, 300));
    const b = hashes(run(42, changed, 300));
    expect(b.slice(0, 1)).toEqual(a.slice(0, 1));
    for (let i = 1; i < a.length; i++) {
      expect(b[i]).not.toBe(a[i]);
    }
  });

  it('hash sees exact float bits', () => {
    const a = new Sim({ seed: 1 });
    const b = new Sim({ seed: 1 });
    a.command(0, { kind: 'spawn', type: 'dummy', x: 0, y: 0 });
    b.command(0, { kind: 'spawn', type: 'dummy', x: -0, y: 0 });
    a.step();
    b.step();
    expect(a.hash()).not.toBe(b.hash());
  });
});
