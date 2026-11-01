// Movement: hero point-move, enemy lane-follow. Runs before the hero kits each tick.

import type { TickContext } from './context.ts';
import type { Entity } from './entities.ts';
import { effectiveSpeed } from './statuses.ts';

/** Steps `e` toward (tx, ty) by at most `step`; returns true on arrival (snapped exactly). */
function stepToward(e: Entity, tx: number, ty: number, step: number): boolean {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d <= step) {
    e.x = tx;
    e.y = ty;
    return true;
  }
  const k = step / d;
  e.x += dx * k;
  e.y += dy * k;
  return false;
}

export function moveSystem(ctx: TickContext): void {
  const { lane } = ctx.game.map;
  for (const e of ctx.entities.values()) {
    const { move: m } = e;
    if (m.mode === 'point') {
      if (stepToward(e, m.tx, m.ty, effectiveSpeed(e))) {
        m.mode = 'idle';
      }
    } else if (m.mode === 'lane') {
      const wp = lane[m.waypoint];
      // Past the last waypoint the enemy system decides what happens (leak).
      if (wp !== undefined && stepToward(e, wp.x, wp.y, effectiveSpeed(e))) {
        m.waypoint += 1;
      }
    }
  }
}
