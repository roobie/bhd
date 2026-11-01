// Divergence of a paired game (step 2c): the first tick where the two logs' events differ.

import type { SimEvent } from '../sim/events.ts';
import type { Divergence, GameLog, RunRecord } from './types.ts';

function gameEvents(log: GameLog): SimEvent[] {
  return log.events.filter((e) => e.kind !== 'hash');
}

/**
 * First tick where the non-`hash` events of two logs differ, comparing event by event in order.
 * When one log is a prefix of the other it is the tick of the first extra event. Null when equal.
 */
export function firstDivergence(base: GameLog, cand: GameLog): number | null {
  const a = gameEvents(base);
  const b = gameEvents(cand);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined || JSON.stringify(x) !== JSON.stringify(y)) {
      return Math.min(x?.tick ?? Number.POSITIVE_INFINITY, y?.tick ?? Number.POSITIVE_INFINITY);
    }
  }
  return null;
}

/** Loads the two logs of a pair and locates where they part. */
export function findDivergence(
  series: string,
  base: RunRecord,
  cand: RunRecord,
  load: (run: RunRecord) => GameLog,
): Divergence {
  return {
    series,
    lineup: base.lineup,
    seed: base.seed,
    tick: firstDivergence(load(base), load(cand)),
    baseLog: base.logPath,
    candLog: cand.logPath,
  };
}
