// The camera: fit the whole map, rotate in portrait, world <-> screen, clip matrix. Owner: w7-viewmath.
// STUB from the contracts slice: signatures are final, bodies are not written.

import type { MapDef } from '../../content/types.ts';
import type { Camera, Insets, Size } from './types.ts';

/**
 * Fits the whole `map` (0..width x 0..height) into `viewport` minus `insets`, centred in the free
 * rectangle, at the largest scale that fits. When the free rectangle is portrait (height > width)
 * the camera is `rotated` 90 degrees clockwise (map west->east reads top->bottom) so a 2:1 map uses
 * more of a phone screen. No pan or zoom. Invariants: `screenToWorld(worldToScreen(p))` is `p` (to
 * float precision) in both orientations; every map corner lands inside the free rectangle.
 */
export function fitCamera(_map: MapDef, _viewport: Size, _insets: Insets): Camera {
  throw new Error('not implemented');
}
