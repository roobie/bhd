// Sim-side wave master invariants (D-4E4QRJ7N6LIGZDSD): command shape, budget refusal, send window,
// carry-over, unlocks and hash coverage. Not what the Director buys.

import { describe, expect, it } from 'vitest';
import type { MasterDef } from '../../src/content/director.ts';
import { defaultMaster } from '../../src/content/director.ts';
import { defaultMasterGame } from '../../src/content/index.ts';
import type { Command } from '../../src/sim/commands.ts';
import { canonicalCommand } from '../../src/sim/commands.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { stateHash } from '../../src/sim/hash.ts';
import { Sim } from '../../src/sim/sim.ts';
import { ticks } from '../../src/sim/time.ts';

const MASTER = 4;
const LONG = 100_000;

function simWith(over: Partial<MasterDef> = {}, firstDelay = 1000): Sim {
  const base = defaultMasterGame();
  const game = {
    ...base,
    master: { ...defaultMaster(), ...over },
    waves: { ...base.waves, firstDelay: firstDelay / 30, interval: 20 },
  };
  return new Sim({ seed: 5, game });
}

function runTo(sim: Sim, tick: number): SimEvent[] {
  const out: SimEvent[] = [];
  while (sim.tick < tick) {
    out.push(...sim.step());
  }
  return out;
}

function master(sim: Sim) {
  if (sim.master === undefined) {
    throw new Error('no master');
  }
  return sim.master;
}

function waveStarts(events: readonly SimEvent[]) {
  return events.flatMap((e) => (e.kind === 'wave' && e.phase === 'start' ? [e] : []));
}

describe('summon and send shape', () => {
  it('accepts well-formed commands and rejects malformed ones before they enter the log', () => {
    const sim = simWith();
    const good: Command[] = [{ kind: 'summon', def: 'grunt', count: 3 }, { kind: 'send' }];
    for (const cmd of good) {
      expect(sim.command(MASTER, cmd, 2).ok).toBe(true);
      expect(canonicalCommand(cmd).kind).toBe(cmd.kind);
    }
    const bad = [
      { kind: 'summon', def: 'grunt', count: 0 },
      { kind: 'summon', def: 'grunt', count: 1.5 },
      { kind: 'summon', def: 'grunt', count: -1 },
      { kind: 'summon', def: '', count: 1 },
      { kind: 'summon', count: 1 },
    ];
    for (const cmd of bad) {
      expect(sim.command(MASTER, cmd as unknown as Command, 2), JSON.stringify(cmd)).toEqual({
        ok: false,
        reason: 'invalid',
      });
    }
  });
});

describe('budget', () => {
  it('refuses an over-budget summon as a logged no-op and changes nothing', () => {
    const sim = simWith();
    const before = master(sim).budget;
    sim.command(MASTER, { kind: 'summon', def: 'grunt', count: before + 1 }, 2);
    const events = runTo(sim, 3);
    expect(events.some((e) => e.kind === 'cmd' && e.cmd.kind === 'summon')).toBe(true);
    expect(master(sim).budget).toBe(before);
    expect(master(sim).pending).toEqual([]);
  });

  it('spends exactly cost times count and merges groups of one def', () => {
    const sim = simWith();
    const before = master(sim).budget;
    const cost = defaultMaster().costs.find((c) => c.def === 'grunt')?.cost ?? Number.NaN;
    sim.command(MASTER, { kind: 'summon', def: 'grunt', count: 2 }, 2);
    sim.command(MASTER, { kind: 'summon', def: 'grunt', count: 1 }, 3);
    runTo(sim, 4);
    expect(master(sim).budget).toBe(before - 3 * cost);
    expect(master(sim).pending).toEqual([{ def: 'grunt', count: 3 }]);
  });

  it('carries unspent budget over and grants the next wave its own', () => {
    const grants = [5, 7, 9];
    const sim = simWith({ budgetPerWave: grants }, 300);
    expect(master(sim).budget).toBe(5);
    sim.command(MASTER, { kind: 'summon', def: 'grunt', count: 2 }, 2);
    const starts = waveStarts(runTo(sim, 301));
    expect(starts).toHaveLength(1);
    // 5 - 2 spent carries over, plus wave 2's grant.
    expect(master(sim).budget).toBe(5 - 2 + 7);
    expect(master(sim).pending).toEqual([]);
  });

  it('refuses a def that is not unlocked for the wave being bought, and accepts it once it is', () => {
    const costs = [
      { def: 'grunt', cost: 1 },
      { def: 'brute', cost: 1, unlockWave: 2 },
    ];
    const sim = simWith({ costs }, 300);
    sim.command(MASTER, { kind: 'summon', def: 'brute', count: 1 }, 2);
    sim.command(MASTER, { kind: 'summon', def: 'grunt', count: 1 }, 3);
    runTo(sim, 301);
    expect(master(sim).pending).toEqual([]);
    sim.command(MASTER, { kind: 'summon', def: 'brute', count: 1 }, sim.tick + 1);
    runTo(sim, sim.tick + 2);
    expect(master(sim).pending).toEqual([{ def: 'brute', count: 1 }]);
  });

  it('refuses summons once no wave is left to buy', () => {
    const base = defaultMasterGame();
    const game = {
      ...base,
      waves: { firstDelay: 0.3, interval: 0.3, waves: base.waves.waves.slice(0, 1) },
    };
    const sim = new Sim({ seed: 1, game });
    runTo(sim, 20);
    const before = master(sim).budget;
    sim.command(MASTER, { kind: 'summon', def: 'grunt', count: 1 }, sim.tick + 1);
    runTo(sim, sim.tick + 2);
    expect(master(sim).budget).toBe(before);
    expect(master(sim).pending).toEqual([]);
  });
});

describe('send window', () => {
  it('refuses a send before the minimum interval and an empty send, accepts one after', () => {
    const sim = simWith({}, LONG);
    const min = ticks(defaultMaster().minIntervalSeconds);
    sim.command(MASTER, { kind: 'summon', def: 'grunt', count: 1 }, 2);
    sim.command(MASTER, { kind: 'send' }, min - 1);
    expect(waveStarts(runTo(sim, min))).toEqual([]);
    sim.command(MASTER, { kind: 'send' }, min + 1);
    expect(waveStarts(runTo(sim, min + 2)).map((w) => w.n)).toEqual([1]);
    const next = simWith({}, LONG);
    next.command(MASTER, { kind: 'send' }, min + 1);
    expect(waveStarts(runTo(next, min + 2))).toEqual([]);
  });

  it('measures the window from the last wave start and restarts the clock on send', () => {
    const sim = simWith({}, LONG);
    const min = ticks(defaultMaster().minIntervalSeconds);
    sim.command(MASTER, { kind: 'summon', def: 'grunt', count: 1 }, 2);
    sim.command(MASTER, { kind: 'send' }, min);
    runTo(sim, min + 1);
    expect(master(sim).lastStart).toBe(min);
    sim.command(MASTER, { kind: 'summon', def: 'grunt', count: 1 }, min + 2);
    sim.command(MASTER, { kind: 'send' }, min + 3);
    expect(waveStarts(runTo(sim, min + 4))).toEqual([]);
    sim.command(MASTER, { kind: 'send' }, 2 * min);
    expect(waveStarts(runTo(sim, 2 * min + 1)).map((w) => w.n)).toEqual([2]);
  });

  it('starts the pending wave at the clock even if empty', () => {
    const sim = simWith({}, 50);
    expect(waveStarts(runTo(sim, 51))).toMatchObject([{ n: 1, composition: [] }]);
  });
});

describe('hash', () => {
  it('covers every leaf of a live master state', () => {
    const sim = simWith({}, 400);
    sim.command(MASTER, { kind: 'summon', def: 'grunt', count: 2 }, 2);
    runTo(sim, 401);
    sim.command(MASTER, { kind: 'summon', def: 'grunt', count: 1 }, 402);
    runTo(sim, 403);
    const m = master(sim);
    expect(m.started.length).toBeGreaterThan(0);
    expect(m.pending.length).toBeGreaterThan(0);
    const hash = (): string =>
      stateHash({
        tick: sim.tick,
        ended: false,
        entities: sim.entities,
        waves: sim.waves,
        rng: sim.rng,
        intents: sim.intents,
        master: sim.master,
      });
    const base = hash();
    const leaves: { obj: { [k: string]: number }; key: string }[] = [
      { obj: m as unknown as { [k: string]: number }, key: 'budget' },
      { obj: m as unknown as { [k: string]: number }, key: 'lastStart' },
      ...m.pending.map((g) => ({ obj: g as unknown as { [k: string]: number }, key: 'count' })),
      ...m.started.flatMap((st) =>
        st.composition.map((g) => ({ obj: g as unknown as { [k: string]: number }, key: 'count' })),
      ),
    ];
    // Every own key of the state is a leaf above or a list the leaves came from.
    expect(Object.keys(m).sort()).toEqual(['budget', 'lastStart', 'pending', 'started']);
    for (const leaf of leaves) {
      const old = leaf.obj[leaf.key] ?? 0;
      leaf.obj[leaf.key] = old + 1;
      expect(hash()).not.toBe(base);
      leaf.obj[leaf.key] = old;
      expect(hash()).toBe(base);
    }
    m.pending.push({ def: 'grunt', count: 1 });
    expect(hash()).not.toBe(base);
  });
});
