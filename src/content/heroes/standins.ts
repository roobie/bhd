// Stand-in heroes: PLACEHOLDERS so a 4-hero team exists (project DESIGN.md §7, wave 1d). They have
// no resources and no invented kits: each is a parameterised role with generic abilities that
// exercise the combat mechanisms (taunt, Marked, heal, pull + Clumped). Owner: stand-in-heroes.
// PLACEHOLDER numbers. Real kits arrive at the wave 6 design checkpoint.

import type { UnitDefBase } from '../types.ts';

interface AbilityBase {
  /** Ability slot 0-3 (the `ability` command's slot). */
  readonly slot: number;
  /** Seconds. */
  readonly cooldown: number;
}

/** Applies `taunted` (src = caster) to every enemy within `radius` of the caster. */
interface TauntAbility extends AbilityBase {
  readonly effect: 'taunt';
  readonly radius: number;
  readonly duration: number;
}

/** Applies `marked` to one hostile within `range` of the caster (the command's target, else the nearest). */
interface MarkAbility extends AbilityBase {
  readonly effect: 'mark';
  readonly range: number;
  readonly duration: number;
  /** Marked bonus damage fraction. */
  readonly value: number;
}

/** Heals every hero (never the Ancient) within `radius` of the caster, the caster included. */
interface HealAbility extends AbilityBase {
  readonly effect: 'heal';
  readonly radius: number;
  readonly amount: number;
}

/**
 * Moves enemies within `radius` of a point (within `range` of the caster) up to `distance` toward
 * that point, then applies `clumped`.
 */
export interface PullAbility extends AbilityBase {
  readonly effect: 'pull';
  readonly range: number;
  readonly radius: number;
  readonly distance: number;
  readonly duration: number;
  /** Clumped bonus damage fraction. */
  readonly value: number;
}

export type StandinAbilityDef = TauntAbility | MarkAbility | HealAbility | PullAbility;

export interface StandinDef extends UnitDefBase {
  readonly kit: 'standin';
  readonly role: 'tank' | 'ranged' | 'support';
  readonly abilities: readonly StandinAbilityDef[];
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
      abilities: [{ slot: 0, effect: 'taunt', cooldown: 8, radius: 8, duration: 3 }],
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
      abilities: [{ slot: 0, effect: 'mark', cooldown: 6, range: 14, duration: 4, value: 0.25 }],
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
      abilities: [
        { slot: 0, effect: 'heal', cooldown: 8, radius: 8, amount: 80 },
        { slot: 1, effect: 'pull', cooldown: 10, range: 10, radius: 5, distance: 4, duration: 2, value: 0.3 },
      ],
    },
  ];
}
