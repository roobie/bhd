// Node only: the browser project runs determinism.browser.test.ts. Replay and seed checks are engine-independent.

import { describe, expect, it } from 'vitest';
import { replayInputs } from '../../src/net/inputlog.ts';
import type { Scripted } from './scenario.ts';
import {
  hashesOf,
  MASTER_TICKS,
  runMasterSim,
  runScenario,
  runSealed,
  runSim,
  runSimInterleaved,
  SCRIPT,
  SEED,
  TICKS,
} from './scenario.ts';

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

  it("replaying the seals of a host-style run reproduces its events, with a bot hero's card accepted as the slot", () => {
    const run = runSealed();
    const replay = replayInputs(run.spec, run.seals);
    expect(replay).toEqual(run.events);
    const accepts = run.seals.flatMap((s) => s.inputs).filter((i) => i.cmd.kind === 'bargain' && i.cmd.op === 'accept');
    expect(accepts.length).toBeGreaterThan(0);
    expect(run.events.some((e) => e.kind === 'bargain' && e.op === 'accept')).toBe(true);
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

  it('the scenario run exercises the Pavise: a block event, a despawn, a respawn (coverage invariant)', () => {
    const kinds = new Set<string>(runSim(SEED, SCRIPT, TICKS).map((e) => e.kind));
    for (const kind of ['block', 'despawn', 'respawn']) {
      expect(kinds.has(kind)).toBe(true);
    }
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

  it('the master-mode script exercises the board (post, cancel, a cast) and the master (summon, send)', () => {
    const events = runMasterSim(SEED, MASTER_TICKS);
    const ops = new Set(events.flatMap((e) => (e.kind === 'intent' ? [e.op] : [])));
    // `reserve` is still a stub on the board (accepted, logged, no events): the intents slice owns it.
    expect(ops.has('post')).toBe(true);
    expect(ops.has('cancel')).toBe(true);
    expect(ops.has('fire') || ops.has('expire')).toBe(true);
    const starts = events.filter((e) => e.kind === 'wave' && e.phase === 'start');
    expect(starts.length).toBeGreaterThan(0);
  });

  it("the master-mode script's callWave starts the pending wave on the tick it is applied", () => {
    const events = runMasterSim(SEED, MASTER_TICKS);
    const call = events.find((e) => e.kind === 'cmd' && e.cmd.kind === 'callWave');
    expect(call).toBeDefined();
    expect(events.some((e) => e.kind === 'wave' && e.phase === 'start' && e.tick === call?.tick)).toBe(true);
  });
});
