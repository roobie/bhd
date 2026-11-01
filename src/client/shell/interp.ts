// Interpolation between two snapshots. Owner: w7-viewmath.

import type { EntitySnap, Snapshot } from './types.ts';

const TAU = Math.PI * 2;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Angle from `a` to `b` by the shortest arc, then scaled by `t`. */
function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % TAU;
  if (d > Math.PI) {
    d -= TAU;
  } else if (d <= -Math.PI) {
    d += TAU;
  }
  return a + d * t;
}

function blend(from: EntitySnap, to: EntitySnap, t: number): EntitySnap {
  return {
    ...to,
    x: lerp(from.x, to.x, t),
    y: lerp(from.y, to.y, t),
    radius: lerp(from.radius, to.radius, t),
    hpFrac: lerp(from.hpFrac, to.hpFrac, t),
    facing: lerpAngle(from.facing, to.facing, t),
  };
}

/**
 * Entities drawn at `alpha` in [0, 1] between `prev` and `curr`: alpha 0 gives prev's positions and
 * alpha 1 gives curr's; x, y, radius, hpFrac are lerped, `facing` by the shortest arc, the rest taken
 * from curr. An entity absent from prev appears at curr; one absent from curr is dropped. With no
 * `prev`, curr as is. Ascending by id.
 */
export function interpolate(prev: Snapshot | undefined, curr: Snapshot, alpha: number): readonly EntitySnap[] {
  if (prev === undefined) {
    return curr.entities;
  }
  const t = Math.min(Math.max(alpha, 0), 1);
  const before = new Map<number, EntitySnap>();
  for (const e of prev.entities) {
    before.set(e.id, e);
  }
  return curr.entities.map((e) => {
    const old = before.get(e.id);
    return old === undefined ? e : blend(old, e, t);
  });
}
