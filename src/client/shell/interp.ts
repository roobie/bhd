// Interpolation between two snapshots. Owner: w7-viewmath.
// STUB from the contracts slice: signatures are final, bodies are not written.

import type { EntitySnap, Snapshot } from './types.ts';

/**
 * Entities drawn at `alpha` in [0, 1] between `prev` and `curr`: alpha 0 gives prev's positions and
 * alpha 1 gives curr's; x, y, radius, hpFrac are lerped, `facing` by the shortest arc, the rest taken
 * from curr. An entity absent from prev appears at curr; one absent from curr is dropped. With no
 * `prev`, curr as is. Ascending by id.
 */
export function interpolate(_prev: Snapshot | undefined, curr: Snapshot, _alpha: number): readonly EntitySnap[] {
  return curr.entities;
}
