// WebGL2 context handling: acquisition, DPR-aware resize, loss and restore. Owner: w7-gl.

export interface ContextEvents {
  /** The context was lost (`webglcontextlost`, default prevented so it can be restored). */
  readonly onLost: () => void;
  /** The context is back (`webglcontextrestored`); the caller rebuilds its GL resources. */
  readonly onRestored: () => void;
}

/** The canvas's WebGL2 context (premultiplied alpha, no depth, no antialias), or undefined if unavailable. */
export function acquireContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | undefined {
  try {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      depth: false,
      stencil: false,
      antialias: false,
    });
    return gl ?? undefined;
  } catch {
    return undefined;
  }
}

/** Sets the canvas CSS size and backing store (`round(css * dpr)` each way); returns the backing size in device pixels. */
export function resizeCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): { readonly width: number; readonly height: number } {
  const scale = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  const width = Math.max(1, Math.round(cssWidth * scale));
  const height = Math.max(1, Math.round(cssHeight * scale));
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  if (canvas.width !== width) {
    canvas.width = width;
  }
  if (canvas.height !== height) {
    canvas.height = height;
  }
  return { width, height };
}

/** Listens for loss and restore on the canvas; returns the function that removes the listeners. */
export function watchContext(canvas: HTMLCanvasElement, events: ContextEvents): () => void {
  const lost = (e: Event): void => {
    e.preventDefault();
    events.onLost();
  };
  const restored = (): void => events.onRestored();
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return () => {
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
  };
}
