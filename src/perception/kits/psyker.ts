// Psyker part of a HeroView. Owner: slice B (w8). Resources: `warp` (frac of max, mark at the end of
// the free zone) and `backlash` (the chance the next cast backlashes, 0..1). Slot 0 is `lash`.

import type { PsykerDef } from '../../content/heroes/psyker.ts';
import { backlashChance, type PsykerState } from '../../sim/heroes/psyker.ts';
import { ticks } from '../../sim/time.ts';
import type { HeroParts } from './parts.ts';

export function psykerParts(def: PsykerDef, kit: PsykerState): HeroParts {
  return {
    kit: 'psyker',
    role: 'psyker',
    resources: [
      {
        name: 'warp',
        frac: def.warp.max > 0 ? kit.warp / def.warp.max : 0,
        band: kit.warpBand,
        marks: [def.backlash.freeBelow / def.warp.max],
      },
      { name: 'backlash', frac: Math.min(1, backlashChance(def, kit.warp)), band: 0, marks: [] },
    ],
    abilities: [
      {
        slot: 0,
        effect: 'lash',
        ready: kit.cdLash === 0,
        cooldownLeft: kit.cdLash,
        cooldownTicks: ticks(def.lash.cooldown),
        range: def.lash.range,
        radius: def.lash.radius,
      },
    ],
    lineAllies: [],
  };
}
