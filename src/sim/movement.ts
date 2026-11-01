import type { TickContext } from './context.ts';

/** PLACEHOLDER (wave 0): straight-line move toward the target, snapping on arrival. */
export function moveSystem(ctx: TickContext): void {
  for (const e of ctx.entities.values()) {
    if (!e.moving) {
      continue;
    }
    const dx = e.tx - e.x;
    const dy = e.ty - e.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= e.speed) {
      e.x = e.tx;
      e.y = e.ty;
      e.moving = false;
    } else {
      const k = e.speed / d;
      e.x += dx * k;
      e.y += dy * k;
    }
  }
}
