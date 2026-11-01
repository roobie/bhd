// WebGL2 context handling: acquisition, DPR-aware resize, loss and restore. Owner: w7-gl.
// STUB from the contracts slice: signatures are final, bodies are not written.

export interface ContextEvents {
  /** The context was lost (`webglcontextlost`, default prevented so it can be restored). */
  readonly onLost: () => void;
  /** The context is back (`webglcontextrestored`); the caller rebuilds its GL resources. */
  readonly onRestored: () => void;
}

/** The canvas's WebGL2 context (premultiplied alpha, no depth, no antialias), or undefined if unavailable. */
export function acquireContext(_canvas: HTMLCanvasElement): WebGL2RenderingContext | undefined {
  return undefined;
}

/** Sets the canvas CSS size and backing store (`round(css * dpr)` each way); returns the backing size in device pixels. */
export function resizeCanvas(
  _canvas: HTMLCanvasElement,
  _cssWidth: number,
  _cssHeight: number,
  _dpr: number,
): { readonly width: number; readonly height: number } {
  throw new Error('not implemented');
}

/** Listens for loss and restore on the canvas; returns the function that removes the listeners. */
export function watchContext(_canvas: HTMLCanvasElement, _events: ContextEvents): () => void {
  throw new Error('not implemented');
}
