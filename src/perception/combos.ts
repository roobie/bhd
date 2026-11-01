// Combo windows (DESIGN "Perception"). STUB (basic and working): the perception slice owns it.
// Contract: for each clump holding at least two enemies that carry a status worth cashing in
// (here `clumped`), one window: the status, the clump centroid, the radius that covers its members,
// how many carry it, and the latest tick it ends. Ordered by clump id.

import type { Clump, ComboWindow, EnemyView } from './types.ts';

const ZONE_STATUS = 'clumped';

export function findComboWindows(enemies: readonly EnemyView[], clumps: readonly Clump[]): ComboWindow[] {
  const byId = new Map(enemies.map((e) => [e.id, e] as const));
  const out: ComboWindow[] = [];
  for (const c of clumps) {
    let count = 0;
    let until = 0;
    let radius = 0;
    for (const id of c.members) {
      const e = byId.get(id);
      const st = e?.statuses.find((s) => s.status === ZONE_STATUS);
      if (e !== undefined && st !== undefined) {
        count += 1;
        until = Math.max(until, st.until);
        const dx = e.x - c.x;
        const dy = e.y - c.y;
        radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy));
      }
    }
    if (count >= 2) {
      out.push({ status: ZONE_STATUS, x: c.x, y: c.y, radius, count, until });
    }
  }
  return out;
}
