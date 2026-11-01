// Scene instances for intents and the arm preview. Owner: w7-arming. Called by scene.ts.
// STUB from the contracts slice: signatures are final, bodies are not written.

import type { InstanceBuffer, IntentFxInput } from './types.ts';

/**
 * Appends, in the decal layer: a marker per live intent (point, kind glyph ring, a ring that empties
 * toward `fireTick` using `tickF`, reserver pips in hero colours), and, while `arming.phase` is
 * `aim` or `time`, the preview of the armed cast at (arming.x, arming.y) with its countdown ring.
 * Sizes honour the pixel floor via `pxPerUnit`. Every float finite.
 */
export function intentInstances(_input: IntentFxInput, _out: InstanceBuffer): void {
  throw new Error('not implemented');
}
