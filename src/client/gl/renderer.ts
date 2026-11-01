// The WebGL2 instanced SDF renderer. Owner: w7-gl.
// STUB from the contracts slice: signatures are final, bodies are not written.

import type { Renderer } from '../shell/types.ts';

/**
 * Builds the renderer on `canvas` (contexts via context.ts, program from shaders.ts), or returns
 * undefined when WebGL2 is unavailable. Context loss flips `lost`, notifies `onLoss(true)`, and on
 * restore rebuilds the program and buffers and notifies `onLoss(false)`; it never throws.
 */
export function createRenderer(_canvas: HTMLCanvasElement): Renderer | undefined {
  return undefined;
}
