// STUB (wave 10 step 1): the sealed-input log. Slice C replaces the bodies; the signatures are the contract.

import type { GameSpec } from '../match/run.ts';
import type { SimEvent } from '../sim/events.ts';
import type { Seal } from './types.ts';

/** Replays `seals` into a fresh Match built from `spec`, submitting each tick's inputs per rule R1; returns every event. */
export function replayInputs(_spec: GameSpec, _seals: readonly Seal[]): SimEvent[] {
  throw new Error('replayInputs: not implemented (wave 10 slice C)');
}
