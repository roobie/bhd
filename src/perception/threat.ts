// Per-hero threat (DESIGN "Perception"). A dimensionless number, 0 = safe: the basic-attack damage
// per second of the enemies that can hurt the hero now (within `radius`, or already attacking it),
// as a fraction of its max hp. Pure function of the inputs.

import type { EnemyView } from './types.ts';

interface Body {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly maxHp: number;
}

export function heroThreat(hero: Body, enemies: readonly EnemyView[], radius: number): number {
  let dps = 0;
  for (const e of enemies) {
    const dx = e.x - hero.x;
    const dy = e.y - hero.y;
    if (e.target === hero.id || dx * dx + dy * dy <= radius * radius) {
      dps += e.dps;
    }
  }
  return hero.maxHp > 0 ? dps / hero.maxHp : 0;
}
