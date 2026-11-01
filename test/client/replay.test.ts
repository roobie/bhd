import { expect, test as it } from 'vitest';
import type { Replay } from '../../src/client/replay.ts';
import { recordLive } from '../../src/client/replay.ts';
import type { DecodedLog } from '../../src/replay/log.ts';
import type { SimEvent } from '../../src/sim/events.ts';

const hash = (tick: number, stateHash: string): SimEvent => ({ tick, kind: 'hash', stateHash });

function replayOf(ticks: number, logged: SimEvent[]): Replay {
  const log = { header: { ticks }, events: logged } as unknown as DecodedLog;
  return {
    kind: 'ready',
    log,
    spec: {} as Replay['spec'],
    logged: logged.flatMap((e) => (e.kind === 'hash' ? [{ tick: e.tick, stateHash: e.stateHash }] : [])),
    live: [],
    verdict: { ok: true, checked: 0, through: 0 },
  };
}

it('a game cut off at maxTicks: hashes past the log end are not a divergence', () => {
  const r = replayOf(60, [hash(30, 'a'), hash(60, 'b')]);
  recordLive(r, [hash(30, 'a'), hash(60, 'b')]);
  recordLive(r, [hash(90, 'c')]);
  expect(r.verdict).toEqual({ ok: true, checked: 2, through: 60 });
});

it('still reports a real mismatch inside the log', () => {
  const r = replayOf(60, [hash(30, 'a'), hash(60, 'b')]);
  recordLive(r, [hash(30, 'x')]);
  expect(r.verdict.ok).toBe(false);
});
