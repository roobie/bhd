// Snapshots of the sim for drawing, and render-time effects from events. Owner: w7-viewmath.
// STUB from the contracts slice: signatures are final, bodies are not written.

import type { SimEvent } from '../../sim/events.ts';
import type { Sim } from '../../sim/sim.ts';
import type { Effect, Snapshot } from './types.ts';

/**
 * The drawable state of `sim` now (live entities in ascending id order; `facing` per the
 * `EntitySnap` contract, using `prev` for the movement direction and the last facing).
 */
export function takeSnapshot(_sim: Sim, _prev: Snapshot | undefined): Snapshot {
  throw new Error('not implemented');
}

/**
 * Advances the effect list: drops finished effects (`nowMs >= startMs + durationMs`), then adds one
 * per relevant event in `events` (`dmg` -> hit on the target, 120 ms; `ability` -> cast on the
 * caster, 250 ms; `death` -> death ghost at the last known position in `snap`'s predecessor or the
 * event's entity if still present, 150 ms). Events naming an unknown entity are skipped.
 */
export function advanceEffects(
  _effects: readonly Effect[],
  _events: readonly SimEvent[],
  _snap: Snapshot,
  _nowMs: number,
): Effect[] {
  throw new Error('not implemented');
}
