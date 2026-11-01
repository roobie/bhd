// Penitent part of a HeroView. Owner: slice A (w8). Pain is a ResourceView (marks empty: A may add
// the Martyrdom threshold); abilities: slot 0 `chain`, slot 3 `martyrdom`.

import type { PenitentDef } from '../../content/heroes/penitent.ts';
import type { PenitentState } from '../../sim/heroes/penitent.ts';
import { ticks } from '../../sim/time.ts';
import type { AbilityView } from '../types.ts';
import type { HeroParts } from './parts.ts';

function ability(slot: number, effect: string, left: number, spec: { cooldown: number; radius: number }): AbilityView {
  const { cooldown, radius } = spec;
  return {
    slot,
    effect,
    ready: left === 0,
    cooldownLeft: left,
    cooldownTicks: ticks(cooldown),
    range: 0,
    radius,
  };
}

export function penitentParts(def: PenitentDef, kit: PenitentState): HeroParts {
  return {
    kit: 'penitent',
    role: 'penitent',
    resources: [{ name: 'pain', frac: def.pain.max > 0 ? kit.pain / def.pain.max : 0, band: kit.painBand, marks: [] }],
    abilities: [
      ability(0, 'chain', kit.cdChain, def.chain),
      ability(3, 'martyrdom', kit.cdMartyrdom, { cooldown: def.martyrdom.cooldown, radius: def.martyrdom.tauntRadius }),
    ],
    lineAllies: [],
  };
}
