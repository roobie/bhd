// Penitent part of a HeroView. Owner: slice A (w8). Resources: `pain` (always; frac of max), and while
// active `martyrdom` (frac of the stance left) and `spent` (frac of the Spent time left), so bots and the
// HUD see both states without a new view type. Abilities: slot 0 `chain`, slot 3 `martyrdom`.

import type { PenitentDef } from '../../content/heroes/penitent.ts';
import type { PenitentState } from '../../sim/heroes/penitent.ts';
import { ticks } from '../../sim/time.ts';
import type { AbilityView, ResourceView } from '../types.ts';
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

function timed(name: string, left: number, seconds: number): ResourceView[] {
  const total = Math.max(1, ticks(seconds));
  return left > 0 ? [{ name, frac: Math.min(1, left / total), band: 0, marks: [] }] : [];
}

export function penitentParts(def: PenitentDef, kit: PenitentState): HeroParts {
  const chain = ability(0, 'chain', kit.cdChain, def.chain);
  const martyrdom = ability(3, 'martyrdom', kit.cdMartyrdom, {
    cooldown: def.martyrdom.cooldown,
    radius: def.martyrdom.tauntRadius,
  });
  return {
    kit: 'penitent',
    role: 'penitent',
    resources: [
      { name: 'pain', frac: def.pain.max > 0 ? kit.pain / def.pain.max : 0, band: kit.painBand, marks: [] },
      ...timed('martyrdom', kit.martyrdomTicks, def.martyrdom.seconds),
      ...timed('spent', kit.spentTicks, def.martyrdom.spentSeconds),
    ],
    abilities: [
      // While Spent the Chain and Martyrdom are refused; report them not ready.
      { ...chain, ready: chain.ready && kit.spentTicks === 0 },
      { ...martyrdom, ready: martyrdom.ready && kit.martyrdomTicks === 0 && kit.spentTicks === 0 },
    ],
    lineAllies: [],
  };
}
