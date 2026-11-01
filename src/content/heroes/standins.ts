// Stand-in heroes: PLACEHOLDERS so a 4-hero team exists (project DESIGN.md §7, wave 1d). They have
// no resources and no invented kits. Owner: stand-in-heroes. PLACEHOLDER numbers.

import type { UnitDefBase } from '../types.ts';

export interface StandinDef extends UnitDefBase {
  readonly kit: 'standin';
  readonly role: 'tank' | 'ranged' | 'support';
}

export function standinDefs(): StandinDef[] {
  return [
    {
      id: 'tank',
      kit: 'standin',
      role: 'tank',
      radius: 0.8,
      maxHp: 900,
      armour: 6,
      speed: 3.5,
      attack: { damage: 15, range: 2, cooldown: 1 },
    },
    {
      id: 'ranged',
      kit: 'standin',
      role: 'ranged',
      radius: 0.5,
      maxHp: 300,
      armour: 0,
      speed: 4,
      attack: { damage: 20, range: 14, cooldown: 1 },
    },
    {
      id: 'support',
      kit: 'standin',
      role: 'support',
      radius: 0.5,
      maxHp: 350,
      armour: 1,
      speed: 4,
      attack: { damage: 6, range: 8, cooldown: 1 },
    },
  ];
}
