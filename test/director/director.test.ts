// Director and tension invariants (D-4E4QRJ7N6LIGZDSD): only valid summon and send commands,
// no refused commands, determinism, data-driven spend, bounds and units of the tension model and
// liveness. Never which units are bought or when.

import { describe, expect, it } from 'vitest';
import { defaultBotSetup } from '../../src/content/bots.ts';
import type { DirectorDef } from '../../src/content/director.ts';
import { defaultDirector } from '../../src/content/director.ts';
import { defaultMasterGame } from '../../src/content/index.ts';
import { deriveRng } from '../../src/detmath/index.ts';
import { createDirector } from '../../src/director/director.ts';
import { createTension, updateTension } from '../../src/director/tension.ts';
import { Match, type MatchOptions } from '../../src/match/match.ts';
import type { Command } from '../../src/sim/commands.ts';
import type { SimEvent } from '../../src/sim/events.ts';

const SEED = 0x12_34_56_78;
const MASTER = 4;
const MAX_TICKS = 40_000;

function options(director: DirectorDef = defaultDirector(), seed = SEED): MatchOptions {
  return { seed, game: defaultMasterGame(), bots: defaultBotSetup(), director };
}

function play(opts: MatchOptions, cap = MAX_TICKS): { events: SimEvent[]; match: Match } {
  const match = new Match(opts);
  const events: SimEvent[] = [];
  while (!match.ended && match.tick < cap) {
    events.push(...match.step());
  }
  return { events, match };
}

function masterCommands(events: readonly SimEvent[]): { tick: number; cmd: Command }[] {
  return events.flatMap((e) => (e.kind === 'cmd' && e.player === MASTER ? [{ tick: e.tick, cmd: e.cmd }] : []));
}

function pendingUnits(match: Match): number {
  return match.sim.master?.pending.reduce((n, g) => n + g.count, 0) ?? 0;
}

/** Why `cmd` (just applied) is not a valid, accepted Director command; empty when fine. A summon landing on a wave-start tick is not checked for growth. */
function problemsOf(cmd: Command, costs: ReadonlySet<string>, waveStarted: boolean, grew: boolean): string[] {
  if (cmd.kind === 'send') {
    return waveStarted ? [] : ['send did not start a wave'];
  }
  if (cmd.kind !== 'summon') {
    return [`unexpected ${cmd.kind}`];
  }
  const out: string[] = [];
  if (!costs.has(cmd.def)) {
    out.push(`unknown def ${cmd.def}`);
  }
  if (!(Number.isInteger(cmd.count) && cmd.count >= 1)) {
    out.push(`bad count ${cmd.count}`);
  }
  if (!(waveStarted || grew)) {
    out.push('summon refused');
  }
  return out;
}

describe('Director commands', () => {
  it('emits only valid summon and send commands, and none is refused', () => {
    const costs = new Set(defaultMasterGame().master?.costs.map((c) => c.def));
    const match = new Match(options());
    const problems: string[] = [];
    let seen = 0;
    while (!match.ended && match.tick < MAX_TICKS) {
      const before = pendingUnits(match);
      const events = match.step();
      const waveStarted = events.some((e) => e.kind === 'wave' && e.phase === 'start');
      for (const { cmd } of masterCommands(events)) {
        seen += 1;
        problems.push(...problemsOf(cmd, costs, waveStarted, pendingUnits(match) > before));
      }
      if ((match.sim.master?.budget ?? 0) < 0) {
        problems.push('negative budget');
      }
    }
    expect(problems).toEqual([]);
    expect(seen).toBeGreaterThan(0);
  });

  it('never submits a second send while one is in flight', () => {
    const { events } = play(options());
    const sends = masterCommands(events).filter((c) => c.cmd.kind === 'send');
    for (let i = 1; i < sends.length; i++) {
      expect((sends[i]?.tick ?? 0) - (sends[i - 1]?.tick ?? 0)).toBeGreaterThan(1);
    }
  });

  it('is deterministic: the same seed and config give identical streams and tension traces', () => {
    const trace = (): { json: string; status: string } => {
      const match = new Match(options());
      const events: SimEvent[] = [];
      const statuses: unknown[] = [];
      while (!match.ended && match.tick < MAX_TICKS) {
        events.push(...match.step());
        statuses.push(match.directorStatus);
      }
      return { json: JSON.stringify(events), status: JSON.stringify(statuses) };
    };
    const a = trace();
    const b = trace();
    expect(a.json).toBe(b.json);
    expect(a.status).toBe(b.status);
  });

  it('buys nothing when the data says to keep everything, and never a def before its unlock wave', () => {
    const def = defaultDirector();
    const hoard: DirectorDef = { ...def, keepFrac: { build: 1, peak: 1, relax: 1 } };
    const { events } = play(options(hoard), 3000);
    expect(masterCommands(events).filter((c) => c.cmd.kind === 'summon')).toEqual([]);
    const locked: DirectorDef = { ...def, mix: def.mix.map((m) => ({ ...m, unlockWave: 99 })) };
    expect(masterCommands(play(options(locked), 3000).events).filter((c) => c.cmd.kind === 'summon')).toEqual([]);
  });

  it('liveness: a Director-driven all-bot game reaches end within a generous bound, across seeds', () => {
    for (const seed of [1, 2, 3]) {
      const { events, match } = play(options(defaultDirector(), seed));
      expect(match.ended, `seed ${seed}`).toBe(true);
      expect(events.filter((e) => e.kind === 'end')).toHaveLength(1);
    }
  });
});

describe('Director think in isolation', () => {
  it('is a pure function of its inputs and own state (two Directors agree)', () => {
    const match = new Match(options());
    for (let i = 0; i < 60; i++) {
      match.step();
    }
    const master = match.masterView;
    if (master === undefined) {
      throw new Error('no master view');
    }
    const def = defaultDirector();
    const ctx = (): Parameters<ReturnType<typeof createDirector>['think']>[0] => ({
      p: match.perception,
      master,
      def,
      rng: deriveRng(SEED, 'director'),
      tick: match.tick,
      inFlight: [],
    });
    const a = createDirector(def);
    const b = createDirector(def);
    expect(a.think(ctx())).toEqual(b.think(ctx()));
    expect(a.status()).toEqual(b.status());
  });

  it('counts in-flight summons against the budget', () => {
    const match = new Match(options());
    match.step();
    const master = match.masterView;
    if (master === undefined) {
      throw new Error('no master view');
    }
    const def = defaultDirector();
    const spendAll: Command = { kind: 'summon', def: 'grunt', count: master.budget };
    const director = createDirector(def);
    const out = director.think({
      p: match.perception,
      master,
      def,
      rng: deriveRng(SEED, 'director'),
      tick: match.tick,
      inFlight: [{ cmd: spendAll, at: match.tick + 5 }],
    });
    expect(out).toEqual([]);
  });
});

describe('tension', () => {
  function perceptionAt(ticksRun: number) {
    const match = new Match(options());
    for (let i = 0; i < ticksRun; i++) {
      match.step();
    }
    return match.perception;
  }

  it('stays within 0..1 and is deterministic over a whole game', () => {
    const def = defaultDirector();
    const run = (): number[] => {
      const match = new Match(options());
      const state = createTension();
      const values: number[] = [];
      while (!match.ended && match.tick < MAX_TICKS) {
        match.step();
        if (match.tick % 30 === 0) {
          updateTension(state, match.perception, def, 1);
          values.push(state.value);
        }
      }
      return values;
    };
    const a = run();
    expect(a.every((v) => v >= 0 && v <= 1)).toBe(true);
    expect(run()).toEqual(a);
  });

  it('low-hp drive is per second and uses lowHpFrac', () => {
    const p = perceptionAt(10);
    const hurt = {
      ...p,
      heroes: p.heroes.map((h) => ({ ...h, hpFrac: 0.1 })),
      team: { ...p.team, damageFrac: 0, leaks: 0 },
    };
    const def = defaultDirector();
    const flat = { ...def, tension: { ...def.tension, decayPerSecond: 0, leakGain: 0, damageGain: 0 } };
    const one = createTension();
    updateTension(one, hurt, flat, 1);
    const two = createTension();
    updateTension(two, hurt, flat, 0.5);
    updateTension(two, hurt, flat, 0.5);
    expect(one.value).toBeCloseTo(two.value, 9);
    expect(one.value).toBeGreaterThan(0);
    // A threshold below every hero's hp makes none low.
    const none = createTension();
    updateTension(none, hurt, { ...flat, tension: { ...flat.tension, lowHpFrac: 0.01 } }, 1);
    expect(none.value).toBe(0);
  });

  it('walks build -> peak -> relax -> build', () => {
    const p = perceptionAt(10);
    const def = defaultDirector();
    const calm = {
      ...p,
      heroes: p.heroes.map((h) => ({ ...h, hpFrac: 1 })),
      team: { ...p.team, damageFrac: 0, leaks: 0 },
    };
    const hot = { ...calm, team: { ...calm.team, damageFrac: 1 } };
    const state = createTension();
    expect(state.phase).toBe('build');
    updateTension(state, hot, def, 1);
    expect(state.phase).toBe('peak');
    const seen = new Set<string>([state.phase]);
    for (let i = 0; i < 200 && state.phase !== 'build'; i++) {
      updateTension(state, calm, def, 1);
      seen.add(state.phase);
    }
    expect([...seen]).toEqual(['peak', 'relax', 'build']);
  });
});
