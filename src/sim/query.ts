// Spatial queries. All results are in ascending entity-ID order; where "nearest" ties, the lower
// ID wins. Distances compare squared lengths (exact IEEE arithmetic, no sqrt needed). A unit is
// hit when its CENTRE is within `reach + unit.radius` of the query shape, i.e. bodies count.
// Dead units (hp <= 0, not yet removed by the deaths system) are never returned.

import type { Point } from '../content/types.ts';
import type { Entity, EntityView, Team } from './entities.ts';

type Unit = Readonly<Entity>;

/** Units whose body is within `radius` of `center`, optionally only of `team`. */
export function unitsInRadius(entities: EntityView, center: Point, radius: number, team?: Team): Unit[] {
  const out: Unit[] = [];
  for (const e of entities.values()) {
    if (e.hp <= 0 || (team !== undefined && e.team !== team)) {
      continue;
    }
    const dx = e.x - center.x;
    const dy = e.y - center.y;
    const reach = radius + e.radius;
    if (dx * dx + dy * dy <= reach * reach) {
      out.push(e);
    }
  }
  return out;
}

/** The nearest unit of the other team to `from` whose body is within `range`. Ties go to the lower ID. */
export function nearestHostile(
  entities: EntityView,
  from: { readonly x: number; readonly y: number; readonly team: Team },
  range: number,
): Unit | undefined {
  let best: Unit | undefined;
  let bestD2 = 0;
  for (const e of entities.values()) {
    if (e.hp <= 0 || e.team === from.team) {
      continue;
    }
    const dx = e.x - from.x;
    const dy = e.y - from.y;
    const d2 = dx * dx + dy * dy;
    const reach = range + e.radius;
    if (d2 <= reach * reach && (best === undefined || d2 < bestD2)) {
      best = e;
      bestD2 = d2;
    }
  }
  return best;
}

/** A unit on a segment query and where along the segment it was hit (0 = `from`, 1 = `to`). */
export interface SegmentHit {
  readonly unit: Unit;
  /** Projection of the unit's centre onto the segment, clamped to [0, 1]. */
  readonly t: number;
}

/**
 * Units whose body touches the segment `from`-`to` widened by `halfWidth`, ordered by `t` (nearest
 * to `from` first), ties by ID, so overpenetration falloff and hit caps can walk the list. Includes
 * ALL teams, the shooter too: callers filter team and self. A zero-length segment is a point.
 */
export function unitsOnSegment(entities: EntityView, from: Point, to: Point, halfWidth: number): SegmentHit[] {
  const sx = to.x - from.x;
  const sy = to.y - from.y;
  const len2 = sx * sx + sy * sy;
  const out: SegmentHit[] = [];
  for (const e of entities.values()) {
    if (e.hp <= 0) {
      continue;
    }
    const px = e.x - from.x;
    const py = e.y - from.y;
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, (px * sx + py * sy) / len2));
    const dx = px - t * sx;
    const dy = py - t * sy;
    const reach = halfWidth + e.radius;
    if (dx * dx + dy * dy <= reach * reach) {
      out.push({ unit: e, t });
    }
  }
  // Entities arrive in ID order and Array.sort is stable, so equal t keeps ID order.
  return out.sort((a, b) => a.t - b.t);
}
