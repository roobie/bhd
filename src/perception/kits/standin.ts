// Stand-in part of a HeroView. Owner: contracts.

import type { StandinAbilityDef, StandinDef } from '../../content/heroes/standins.ts';
import type { StandinState } from '../../sim/heroes/standins.ts';
import { ticks } from '../../sim/time.ts';
import type { AbilityView } from '../types.ts';
import type { HeroParts } from './parts.ts';

function standinAbility(ab: StandinAbilityDef, cooldownLeft: number): AbilityView {
  const range = ab.effect === 'mark' || ab.effect === 'pull' ? ab.range : 0;
  const radius = ab.effect === 'mark' ? 0 : ab.radius;
  return {
    slot: ab.slot,
    effect: ab.effect,
    ready: cooldownLeft === 0,
    cooldownLeft,
    cooldownTicks: ticks(ab.cooldown),
    range,
    radius,
  };
}

export function standinParts(def: StandinDef, kit: StandinState): HeroParts {
  return {
    kit: 'standin',
    role: def.role,
    resources: [],
    abilities: def.abilities.map((ab) => standinAbility(ab, kit.cooldowns[ab.slot] ?? 0)),
    lineAllies: [],
  };
}
