// Engine hooks for the intents board and the wave master (wave w2-bots step 1). Board and master
// logic are tested by their own slices; this pins the hooks: phase order, logged no-ops, schedule vs master mode.

import { describe, expect, it } from 'vitest';
import { defaultGame, defaultMasterGame } from '../../src/content/index.ts';
import type { Command } from '../../src/sim/commands.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { Sim } from '../../src/sim/sim.ts';
import { ticks } from '../../src/sim/time.ts';

const GUNNER = 2;

function runTo(sim: Sim, tick: number): SimEvent[] {
  const out: SimEvent[] = [];
  while (sim.tick < tick) {
    out.push(...sim.step());
  }
  return out;
}

function intentOps(events: readonly SimEvent[]): [number, string][] {
  return events.flatMap((e) => (e.kind === 'intent' ? [[e.tick, e.op] as [number, string]] : []));
}

describe('intents phase', () => {
  it('posts when the command applies and resolves exactly once at its fire tick', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    const post: Command = {
      kind: 'intent',
      op: 'post',
      hero: GUNNER,
      slot: 1,
      intentKind: 'vent',
      x: 70,
      y: 28,
      fireIn: 5,
    };
    expect(sim.command(0, post, 10).ok).toBe(true);
    const ops = intentOps(runTo(sim, 30));
    expect(ops[0]).toEqual([10, 'post']);
    expect(ops).toHaveLength(2);
    expect(ops[1]?.[0]).toBe(15);
    expect(['fire', 'expire']).toContain(ops[1]?.[1]);
    expect(sim.intents.live.length).toBeLessThanOrEqual(1);
  });

  it('runs after commands: post then cancel in one tick never reaches the fire tick', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    sim.command(0, { kind: 'intent', op: 'post', hero: GUNNER, slot: 1, intentKind: 'vent', x: 1, y: 1, fireIn: 1 }, 5);
    sim.command(0, { kind: 'intent', op: 'cancel', hero: GUNNER, intent: 1 }, 5);
    const events = runTo(sim, 8);
    expect(intentOps(events)).toEqual([
      [5, 'post'],
      [5, 'cancel'],
    ]);
  });

  it('logs a post by a missing hero as a no-op', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    sim.command(0, { kind: 'intent', op: 'post', hero: 99, slot: 0, intentKind: 'x', x: 0, y: 0, fireIn: 3 }, 2);
    const events = runTo(sim, 3);
    expect(events.some((e) => e.kind === 'cmd')).toBe(true);
    expect(intentOps(events)).toEqual([]);
    expect(sim.intents.nextId).toBe(1);
  });
});

describe('wave master hooks', () => {
  it('schedule mode has no master state and ignores summon and send', () => {
    const sim = new Sim({ seed: 1, game: defaultGame() });
    expect(sim.master).toBeUndefined();
    sim.command(4, { kind: 'summon', def: 'grunt', count: 1 }, 2);
    sim.command(4, { kind: 'send' }, 3);
    const events = runTo(sim, 4);
    expect(events.filter((e) => e.kind === 'wave')).toEqual([]);
  });

  it('master mode: a summon is refused over budget and a send obeys the minimum interval', () => {
    const base = defaultMasterGame();
    const game = { ...base, waves: { ...base.waves, firstDelay: 100 } };
    const sim = new Sim({ seed: 1, game });
    const { master } = sim;
    expect(master).toBeDefined();
    const start = master?.budget ?? 0;
    sim.command(4, { kind: 'summon', def: 'grunt', count: 1 }, 2);
    sim.command(4, { kind: 'summon', def: 'boss', count: 1000 }, 3);
    sim.command(4, { kind: 'summon', def: 'nonesuch', count: 1 }, 4);
    sim.command(4, { kind: 'send' }, 5);
    const events = runTo(sim, 6);
    expect(master?.budget).toBe(start - 1);
    expect(master?.pending).toEqual([{ def: 'grunt', count: 1 }]);
    expect(events.filter((e) => e.kind === 'wave')).toEqual([]);
    const minTick = ticks(game.master?.minIntervalSeconds ?? 0);
    sim.command(4, { kind: 'send' }, minTick + 1);
    const later = runTo(sim, minTick + 1);
    const waves = later.filter((e) => e.kind === 'wave');
    expect(waves).toMatchObject([
      { tick: minTick + 1, n: 1, phase: 'start', composition: [{ def: 'grunt', count: 1 }] },
    ]);
  });

  it('master mode: the end event carries the started composition', () => {
    const sim = new Sim({ seed: 1, game: defaultMasterGame() });
    sim.command(4, { kind: 'summon', def: 'grunt', count: 2 }, 2);
    const events = runTo(sim, 1500);
    const waves = events.flatMap((e) => (e.kind === 'wave' ? [e] : []));
    const first = waves.filter((w) => w.n === 1);
    expect(first.map((w) => w.phase)).toContain('start');
    for (const w of first) {
      expect(w.composition).toEqual([{ def: 'grunt', count: 2 }]);
    }
  });
});
