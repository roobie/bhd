// Per-hero threat (DESIGN "Perception"). STUB (basic and working): the perception slice owns it.
// Contract: a dimensionless number, 0 = safe; here the damage per second of enemies within `radius`
// of the hero as a fraction of its max hp. Pure function of the inputs.

import type { EnemyView } from './types.ts';

interface Body {
  readonly x: number;
  readonly y: number;
  readonly maxHp: number;
}

export function heroThreat(hero: Body, enemies: readonly EnemyView[], radius: number): number {
  let dps = 0;
  for (const e of enemies) {
    const dx = e.x - hero.x;
    const dy = e.y - hero.y;
    if (dx * dx + dy * dy <= radius * radius) {
      dps += e.dps;
    }
  }
  return hero.maxHp > 0 ? dps / hero.maxHp : 0;
}
