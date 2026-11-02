// Driver and determinism invariants (D-4E4QRJ7N6LIGZDSD: no gameplay numbers). A driven game's human
// commands, recorded through the driver, replay into a fresh match from the same spec with identical
// state hashes. Headless: no renderer.

import { describe, expect, it } from 'vitest';
import { shellSpec } from '../../../src/client/shell/config.ts';
import { localDriver } from '../../../src/client/shell/driver.ts';
import type { TickDriver } from '../../../src/client/shell/types.ts';
import { INPUT_DELAY_TICKS } from '../../../src/client/shell/types.ts';
import type { Match } from '../../../src/match/match.ts';
import { buildMatch } from '../../../src/match/run.ts';
import type { Command } from '../../../src/sim/commands.ts';

interface Recorded {
  readonly player: number;
  readonly cmd: Command;
  readonly at: number;
}

const TICKS = 450;

function script(hero: number, tick: number): Command[] {
  switch (tick) {
    case 5:
      return [{ kind: 'move', hero, x: 30, y: 20 }];
    case 60:
      return [{ kind: 'ability', hero, slot: 0, x: 40, y: 25 }];
    case 90:
      return [{ kind: 'hold', hero, on: true }];
    case 120:
      return [{ kind: 'autocast', hero, slot: 1, on: true }];
    case 150:
      return [{ kind: 'ability', hero, slot: 1, x: 35, y: 22 }];
    case 200:
      return [
        { kind: 'hold', hero, on: false },
        { kind: 'stop', hero },
      ];
    case 300:
      return [{ kind: 'move', hero, x: 10, y: 10 }];
    default:
      return [];
  }
}

function hashes(match: Match, before: (tick: number) => void): string[] {
  const out: string[] = [];
  for (let i = 0; i < TICKS; i++) {
    before(match.tick);
    match.step();
    out.push(match.sim.hash());
  }
  return out;
}

describe('localDriver', () => {
  it('applies a command INPUT_DELAY_TICKS after the current tick', () => {
    const match = buildMatch(shellSpec({ seed: 1, mode: 'director', drive: [0] }));
    const hero = match.perception.heroes[0]?.id ?? -1;
    const applied: number[] = [];
    const real = match.sim.command.bind(match.sim);
    match.sim.command = (player, cmd, tick) => {
      applied.push(tick ?? -1);
      return real(player, cmd, tick);
    };
    match.step();
    localDriver(match, INPUT_DELAY_TICKS).submit(0, { kind: 'stop', hero });
    expect(applied).toContain(match.tick + INPUT_DELAY_TICKS);
  });
});

describe('localDriver as a TickDriver', () => {
  it('never gates stepping, has no step hooks to run, and reports running until the game ends', () => {
    const match = buildMatch(shellSpec({ seed: 1, mode: 'director', drive: [0] }));
    const driver = localDriver(match, INPUT_DELAY_TICKS);
    expect(driver.steppable()).toBe(Number.POSITIVE_INFINITY);
    expect(driver.status()).toBe('running');
    const before = match.sim.hash();
    driver.beforeStep(match.tick + 1);
    driver.afterStep([]);
    expect(match.sim.hash()).toBe(before);
    expect(match.tick).toBe(0);
  });
});

describe('driven game determinism', () => {
  const spec = shellSpec({ seed: 11, mode: 'director', drive: [0] });

  it('replays recorded human commands into an identical hash sequence', () => {
    const live = buildMatch(spec);
    const hero = live.perception.heroes[0]?.id ?? -1;
    expect(hero).toBeGreaterThanOrEqual(0);
    const recorded: Recorded[] = [];
    const inner = localDriver(live, INPUT_DELAY_TICKS);
    const sink: TickDriver = {
      ...inner,
      submit(player, cmd) {
        recorded.push({ player, cmd, at: live.tick + INPUT_DELAY_TICKS });
        inner.submit(player, cmd);
      },
    };
    const first = hashes(live, (tick) => {
      for (const cmd of script(hero, tick)) {
        sink.submit(0, cmd);
      }
    });
    expect(recorded.length).toBeGreaterThan(0);

    const fresh = buildMatch(spec);
    const second = hashes(fresh, (tick) => {
      for (const r of recorded) {
        if (r.at - INPUT_DELAY_TICKS === tick) {
          fresh.sim.command(r.player, r.cmd, r.at);
        }
      }
    });
    expect(second).toEqual(first);
  });
});
