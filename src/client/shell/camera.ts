// The camera: fit the whole map, rotate in portrait, world <-> screen, clip matrix. Owner: w7-viewmath.

import type { MapDef } from '../../content/types.ts';
import type { Camera, Insets, Size, Vec2 } from './types.ts';

/** Smallest scale handed out, so a degenerate (zero-area) free rectangle stays invertible. */
const MIN_SCALE = 1e-6;

/** Affine map `(x, y) -> (a x + c y + e, b x + d y + f)`. */
interface Affine {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

function apply(m: Affine, p: Vec2): Vec2 {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

function invert(m: Affine, p: Vec2): Vec2 {
  const det = m.a * m.d - m.b * m.c;
  const x = p.x - m.e;
  const y = p.y - m.f;
  return { x: (m.d * x - m.c * y) / det, y: (m.a * y - m.b * x) / det };
}

/** World -> clip (3x3 column-major, clip y up) for a world -> screen affine and a viewport. */
function clipMatrix(m: Affine, v: Size): Float32Array {
  const kx = 2 / v.width;
  const ky = -2 / v.height;
  return new Float32Array([kx * m.a, ky * m.b, 0, kx * m.c, ky * m.d, 0, kx * m.e - 1, ky * m.f + 1, 1]);
}

/**
 * Fits the whole `map` (0..width x 0..height) into `viewport` minus `insets`, centred in the free
 * rectangle, at the largest scale that fits. When the free rectangle is portrait (height > width)
 * the camera is `rotated` 90 degrees clockwise (map west->east reads top->bottom) so a 2:1 map uses
 * more of a phone screen. No pan or zoom. Invariants: `screenToWorld(worldToScreen(p))` is `p` (to
 * float precision) in both orientations; every map corner lands inside the free rectangle.
 */
export function fitCamera(map: MapDef, viewport: Size, insets: Insets): Camera {
  const freeW = Math.max(viewport.width - insets.left - insets.right, 0);
  const freeH = Math.max(viewport.height - insets.top - insets.bottom, 0);
  const rotated = freeH > freeW;
  const cx = insets.left + freeW / 2;
  const cy = insets.top + freeH / 2;
  const mw = map.width;
  const mh = map.height;
  let m: Affine;
  let pxPerUnit: number;
  if (rotated) {
    // East -> down, south -> left (clockwise quarter turn).
    pxPerUnit = Math.max(Math.min(freeW / mh, freeH / mw), MIN_SCALE);
    m = { a: 0, b: pxPerUnit, c: -pxPerUnit, d: 0, e: cx + (mh / 2) * pxPerUnit, f: cy - (mw / 2) * pxPerUnit };
  } else {
    pxPerUnit = Math.max(Math.min(freeW / mw, freeH / mh), MIN_SCALE);
    m = { a: pxPerUnit, b: 0, c: 0, d: pxPerUnit, e: cx - (mw / 2) * pxPerUnit, f: cy - (mh / 2) * pxPerUnit };
  }
  const right = viewport.width - insets.right;
  const bottom = viewport.height - insets.bottom;
  return {
    viewport,
    rotated,
    pxPerUnit,
    matrix: clipMatrix(m, viewport),
    worldToScreen: (p) => apply(m, p),
    screenToWorld: (p) => invert(m, p),
    isMapPoint: (p) => {
      if (p.x < insets.left || p.x > right || p.y < insets.top || p.y > bottom) {
        return false;
      }
      const w = invert(m, p);
      return w.x >= 0 && w.x <= mw && w.y >= 0 && w.y <= mh;
    },
  };
}
