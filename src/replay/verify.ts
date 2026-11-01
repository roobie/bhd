// Replay verification: compares the state hashes a live game produces against the `hash` events of
// a log. A log replays faithfully when every live checkpoint equals the logged one. Pure.

import type { SimEvent } from '../sim/events.ts';

/** One `hash` event: the state hash after `tick` completed. */
export interface Checkpoint {
  readonly tick: number;
  readonly stateHash: string;
}

export type Verdict =
  | {
      readonly ok: true;
      /** Live checkpoints that matched. */
      readonly checked: number;
      /** Tick of the last matched checkpoint (0 when none yet). */
      readonly through: number;
    }
  | {
      readonly ok: false;
      /** Tick of the first checkpoint that does not match. */
      readonly tick: number;
      /** The logged hash there (`undefined`: the log has no checkpoint at that position). */
      readonly expected: string | undefined;
      readonly actual: string;
    };

/** The `hash` events of an event stream, in order. */
export function checkpoints(events: readonly SimEvent[]): Checkpoint[] {
  const out: Checkpoint[] = [];
  for (const e of events) {
    if (e.kind === 'hash') {
      out.push({ tick: e.tick, stateHash: e.stateHash });
    }
  }
  return out;
}

/**
 * Compares the live checkpoints with the logged ones, position by position. The live list may be a
 * prefix (a game still running): the result is then "verified so far". The first live checkpoint
 * whose tick or hash differs from the logged one at its position, or that the log does not have at
 * all, is the divergence.
 */
export function verifyHashes(logged: readonly Checkpoint[], live: readonly Checkpoint[]): Verdict {
  for (let i = 0; i < live.length; i++) {
    const want = logged[i];
    const got = live[i];
    if (got === undefined) {
      continue;
    }
    if (want === undefined || want.tick !== got.tick || want.stateHash !== got.stateHash) {
      return {
        ok: false,
        tick: want === undefined ? got.tick : Math.min(want.tick, got.tick),
        expected: want?.stateHash,
        actual: got.stateHash,
      };
    }
  }
  return { ok: true, checked: live.length, through: live.at(-1)?.tick ?? 0 };
}
