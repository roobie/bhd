// Pure layout helpers for the debug viewer: world -> screen transform. No DOM.

export interface Fit {
  /** Pixels per world unit. */
  readonly scale: number;
  /** Screen position of world (0, 0). */
  readonly ox: number;
  readonly oy: number;
}

interface Size {
  readonly w: number;
  readonly h: number;
}

/** Largest uniform scale that fits a world-sized map into a canvas, centred, with a pixel margin. */
export function fitWorld(world: Size, canvas: Size, margin: number): Fit {
  const availW = Math.max(1, canvas.w - 2 * margin);
  const availH = Math.max(1, canvas.h - 2 * margin);
  const scale = Math.min(availW / Math.max(world.w, 1e-9), availH / Math.max(world.h, 1e-9));
  return { scale, ox: (canvas.w - world.w * scale) / 2, oy: (canvas.h - world.h * scale) / 2 };
}

export function toScreen(fit: Fit, x: number, y: number): { readonly x: number; readonly y: number } {
  return { x: fit.ox + x * fit.scale, y: fit.oy + y * fit.scale };
}
