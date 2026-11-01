// Node only: the browser project runs determinism.test.ts. Replay and seed checks are engine-independent.

import { describe, expect, it } from 'vitest';
import type { Scripted } from './scenario.ts';
import { hashesOf, runScenario, runSim, runSimInterleaved, SCRIPT, SEED, TICKS } from './scenario.ts';

describe('determinism (node)', () => {
  it('runs twice to identical results', () => {
    expect(runScenario()).toEqual(runScenario());
  });

  it('replays JSON-round-tripped cmd events to the identical event stream', () => {
    const events = runSim(SEED, SCRIPT, TICKS);
    const wire: unknown = JSON.parse(JSON.stringify(events));
    const logged = wire as typeof events;
    const replay: Scripted[] = logged.flatMap((e) =>
      e.kind === 'cmd' ? [{ tick: e.tick, player: e.player, cmd: e.cmd }] : [],
    );
    expect(replay).toHaveLength(SCRIPT.length);
    expect(runSim(SEED, replay, TICKS)).toEqual(events);
  });

  it('logs no negative zero', () => {
    const events = runSim(SEED, SCRIPT, TICKS);
    const cmds = events.flatMap((e) => (e.kind === 'cmd' ? [e.cmd] : []));
    const zeros = cmds.flatMap((c) => Object.values(c)).filter((v) => Object.is(v, -0));
    expect(SCRIPT.some((s) => Object.values(s.cmd).some((v) => Object.is(v, -0)))).toBe(true);
    expect(zeros).toEqual([]);
  });

  it('submitting each command just before its tick gives the same events', () => {
    expect(runSimInterleaved(SEED, SCRIPT, TICKS)).toEqual(runSim(SEED, SCRIPT, TICKS));
  });

  it("applies a player's same-tick commands in submission order (end to end; comparator tested in sim.test.ts)", () => {
    const pair = SCRIPT.flatMap((s, idx) => (s.tick === 40 && s.player === 0 ? [idx] : []));
    expect(pair).toHaveLength(2);
    const [first, second] = pair;
    const swapped = SCRIPT.map((s, idx) => {
      if (idx === first) {
        return SCRIPT[second ?? idx] ?? s;
      }
      return idx === second ? (SCRIPT[first ?? idx] ?? s) : s;
    });
    expect(swapped).not.toEqual(SCRIPT);
    expect(hashesOf(runSim(SEED, swapped, TICKS))).not.toEqual(hashesOf(runSim(SEED, SCRIPT, TICKS)));
  });

  it('hashes the last tick', () => {
    const events = runSim(SEED, SCRIPT, TICKS);
    expect(events.at(-1)).toMatchObject({ kind: 'hash', tick: TICKS });
  });

  it('changes hashes when the seed changes', () => {
    const a = hashesOf(runSim(SEED, SCRIPT, TICKS));
    const b = hashesOf(runSim(SEED + 1, SCRIPT, TICKS));
    expect(b).toHaveLength(a.length);
    expect(b).not.toEqual(a);
  });
});
