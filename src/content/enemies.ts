// Enemy roster (project DESIGN.md §5). Owner: lane-waves. PLACEHOLDER numbers.

import type { EnemyDef } from './types.ts';

export function defaultEnemies(): EnemyDef[] {
  return [
    // Fast, fragile: can you cover the lane?
    {
      id: 'runner',
      radius: 0.4,
      maxHp: 30,
      armour: 0,
      speed: 7,
      leakDamage: 1,
      attack: { damage: 2, range: 1, cooldown: 1 },
    },
    // Baseline.
    {
      id: 'grunt',
      radius: 0.5,
      maxHp: 80,
      armour: 1,
      speed: 3,
      leakDamage: 1,
      attack: { damage: 5, range: 1, cooldown: 1 },
    },
    // Armoured, slow: punishes cold Gunner fire.
    {
      id: 'brute',
      radius: 0.8,
      maxHp: 300,
      armour: 8,
      speed: 2.5,
      leakDamage: 2,
      attack: { damage: 15, range: 1.5, cooldown: 1.5 },
    },
    // Every 5th wave: do you have a wombo ready?
    {
      id: 'boss',
      radius: 1.2,
      maxHp: 1500,
      armour: 10,
      speed: 2,
      leakDamage: 5,
      attack: { damage: 40, range: 2, cooldown: 2 },
    },
  ];
}
