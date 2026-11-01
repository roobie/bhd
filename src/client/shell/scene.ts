// The scene: drawn entities + perception + controls -> instances in world space. Owner: w7-scene.
// STUB from the contracts slice: signatures are final, bodies are not written.

import type { InstanceBuffer, SceneInput } from './types.ts';

/**
 * Appends one frame of instances to `out` (the caller clears it first), in painter's order:
 * ground (map rect, lane segments, Ancient), decals (ranges, aim previews, then
 * `intentInstances` from intentfx.ts), bodies, overlays (hp arcs, status pips, selection ring,
 * facing marks, effects). Sizes below `MIN_BODY_PX` css pixels are raised to it via
 * `input.camera.pxPerUnit`. Reads colours and labels only through content/presentation.ts
 * fallback lookups; never switches on a hero, kit, effect or status name. Every float finite;
 * every shape id one of `SHAPE`.
 */
export function buildScene(_input: SceneInput, _out: InstanceBuffer): void {
  throw new Error('not implemented');
}

/** Pixel floor for body radii, pips and markers (css px). */
export const MIN_BODY_PX = 6;
