// Psyker part of a HeroView. Owner: slice B (w8). Warp is a ResourceView; B adds the `backlash`
// resource (chance as a frac) and any further abilities here. Slot 0 is `lash`.

import type { PsykerDef } from '../../content/heroes/psyker.ts';
import type { PsykerState } from '../../sim/heroes/psyker.ts';
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
