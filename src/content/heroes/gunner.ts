// Gunner "The Furnace" (project DESIGN.md §4.1). Owner: gunner. PLACEHOLDER numbers; the gunner
// slice adds its kit parameters (heat, spin, brace, vent...) to GunnerDef.

import type { UnitDefBase } from '../types.ts';

export interface GunnerDef extends UnitDefBase {
  readonly kit: 'gunner';
}

export function gunnerDef(): GunnerDef {
  return {
    id: 'gunner',
    kit: 'gunner',
    radius: 0.6,
    maxHp: 400,
    armour: 1,
    speed: 4,
    attack: { damage: 8, range: 12, cooldown: 0.25 },
  };
}
