// Control commands (wave 10): the sim validates and logs them and does nothing; Match applies them from
// the step's `cmd` events, only when they come from SYSTEM_PLAYER, at the same tick on every Match.
// Invariants only (D-4E4QRJ7N6LIGZDSD).

import { describe, expect, it } from 'vitest';
import { defaultBotSetup } from '../../src/content/bots.ts';
import { defaultGame } from '../../src/content/index.ts';
import { Match } from '../../src/match/match.ts';
import { type Command, SYSTEM_PLAYER } from '../../src/sim/commands.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { Sim } from '../../src/sim/sim.ts';

const SEED = 0x24_68_ac_e1;

function match(): Match {
  return new Match({ seed: SEED, game: defaultGame(), bots: defaultBotSetup(), hashEvery: 10 });
}

function stepTo(m: Match, tick: number): SimEvent[] {
  const out: SimEvent[] = [];
  while (m.tick < tick && !m.ended) {
    out.push(...m.step());
  }
  return out;
}

const DRIVE: Command = { kind: 'control', op: 'drive', slot: 1, by: 'human' };
const POLICY: Command = { kind: 'control', op: 'bargainPolicy', policy: 'off' };

describe('control commands in the sim', () => {
  it('are logged as cmd events and change no game state', () => {
    const a = new Sim({ seed: SEED, game: defaultGame(), hashEvery: 10 });
    const b = new Sim({ seed: SEED, game: defaultGame(), hashEvery: 10 });
    expect(a.command(SYSTEM_PLAYER, DRIVE, 5).ok).toBe(true);
    expect(a.command(SYSTEM_PLAYER, POLICY, 5).ok).toBe(true);
    const events = Array.from({ length: 20 }).flatMap(() => a.step());
    const logged = events.filter((e) => e.kind === 'cmd');
    expect(logged.map((e) => [e.tick, e.player, e.cmd])).toEqual([
      [5, SYSTEM_PLAYER, DRIVE],
      [5, SYSTEM_PLAYER, POLICY],
    ]);
    for (let i = 0; i < 20; i++) {
      b.step();
    }
    expect(a.hash()).toBe(b.hash());
  });

  it('are rejected at submission when malformed', () => {
    const sim = new Sim({ seed: SEED, game: defaultGame() });
    const bad = { kind: 'control', op: 'drive', slot: 9, by: 'human' } as unknown as Command;
    expect(sim.command(SYSTEM_PLAYER, bad)).toEqual({ ok: false, reason: 'invalid' });
  });
});

describe('Match.step applies control commands', () => {
  it('drive: from SYSTEM_PLAYER at the tick they applied in, on every Match alike', () => {
    const ms = [match(), match()];
    for (const m of ms) {
      m.sim.command(SYSTEM_PLAYER, { kind: 'control', op: 'drive', slot: 2, by: 'human' }, 10);
      m.sim.command(SYSTEM_PLAYER, { kind: 'control', op: 'drive', slot: 0, by: 'human' }, 12);
      m.sim.command(SYSTEM_PLAYER, { kind: 'control', op: 'drive', slot: 2, by: 'bot' }, 14);
    }
    const seen: number[][] = [];
    for (const m of ms) {
      const driven: number[] = [];
      for (let tick = 9; tick <= 15; tick++) {
        stepTo(m, tick);
        driven.push(...m.driven, -1);
      }
      seen.push(driven);
    }
    expect(seen[0]).toEqual(seen[1]);
    // Nothing before tick 10; slot 2 from 10; slots 0 and 2 from 12; slot 0 only from 14.
    expect(seen[0]).toEqual([-1, 2, -1, 2, -1, 0, 2, -1, 0, 2, -1, 0, -1, 0, -1]);
    expect(ms[0]?.sim.hash()).toBe(ms[1]?.sim.hash());
  });

  it('bargainPolicy: sets the policy', () => {
    const m = match();
    const before = m.bargainPolicy;
    const policy = before === 'off' ? 'human' : 'off';
    m.sim.command(SYSTEM_PLAYER, { kind: 'control', op: 'bargainPolicy', policy }, 3);
    stepTo(m, 2);
    expect(m.bargainPolicy).toBe(before);
    stepTo(m, 3);
    expect(m.bargainPolicy).toBe(policy);
  });

  it('ignores control commands from any other player', () => {
    const m = match();
    const policy = m.bargainPolicy === 'off' ? 'human' : 'off';
    for (const player of [0, 1, 2, 3, 4, 6]) {
      m.sim.command(player, { kind: 'control', op: 'drive', slot: 3, by: 'human' }, 4);
      m.sim.command(player, { kind: 'control', op: 'bargainPolicy', policy }, 4);
    }
    const events = stepTo(m, 6);
    expect(events.filter((e) => e.kind === 'cmd' && e.cmd.kind === 'control')).toHaveLength(12);
    expect(m.driven).toEqual([]);
    expect(m.bargainPolicy).not.toBe(policy);
  });
});
