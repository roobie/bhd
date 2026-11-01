// Gunner part of a HeroView. Owner: slice C (w8) for the Pavise semantics; the rest is unchanged.

import type { GunnerDef } from '../../content/heroes/gunner.ts';
import { cos, PI } from '../../detmath/index.ts';
import type { Entity } from '../../sim/entities.ts';
import type { GunnerState } from '../../sim/heroes/gunner.ts';
import { STANCE } from '../../sim/heroes/gunner.ts';
import { unitsOnSegment } from '../../sim/query.ts';
import type { Sim } from '../../sim/sim.ts';
import { ticks } from '../../sim/time.ts';
import type { AbilityView } from '../types.ts';
import type { HeroParts } from './parts.ts';

function gunnerAbilities(def: GunnerDef, kit: GunnerState): AbilityView[] {
  const usable = kit.lockTicks === 0;
  const make = (slot: number, effect: string, cd: readonly [number, number], range: number): AbilityView => ({
    slot,
    effect,
    ready: cd[0] === 0 && usable,
    cooldownLeft: cd[0],
    cooldownTicks: ticks(cd[1]),
    range,
    radius: 0,
  });
  return [
    {
      slot: 0,
      effect: 'brace',
      ready: kit.unbraceTicks === 0,
      cooldownLeft: kit.unbraceTicks,
      cooldownTicks: ticks(def.brace.unbraceSeconds),
      range: 0,
      radius: 0,
    },
    make(1, 'vent', [kit.cdVent, def.vent.cooldown], def.vent.range),
    make(2, 'pavise', [kit.cdPavise, def.pavise.cooldown], def.pavise.range),
    make(3, 'furnace', [kit.cdFurnace, def.furnace.cooldown], 0),
  ];
}

/** Cosine of half of a full cone width given in degrees (bots cannot use trig). */
function halfAngleCos(fullDegrees: number): number {
  return cos((fullDegrees * PI) / 360);
}

/** Heroes the Gunner's line would hit: mirrors the sim's `fireLine` geometry (muzzle at the body edge). */
function lineAlliesOf(sim: Sim, hero: Readonly<Entity>, range: number, halfWidth: number): number[] {
  const target = sim.entities.get(hero.attack.target);
  if (target === undefined || target.hp <= 0) {
    return [];
  }
  const dx = target.x - hero.x;
  const dy = target.y - hero.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = len === 0 ? 1 : dx / len;
  const uy = len === 0 ? 0 : dy / len;
  const from = { x: hero.x + ux * hero.radius, y: hero.y + uy * hero.radius };
  const to = { x: hero.x + ux * range, y: hero.y + uy * range };
  return unitsOnSegment(sim.entities, from, to, halfWidth)
    .filter(
      (h) =>
        h.unit.kind === 'hero' && h.unit.id !== hero.id && (h.unit.x - from.x) * ux + (h.unit.y - from.y) * uy >= 0,
    )
    .map((h) => h.unit.id)
    .sort((a, b) => a - b);
}

export function gunnerParts(sim: Sim, e: Readonly<Entity>, def: GunnerDef, kit: GunnerState): HeroParts {
  const heat = kit.heat / 10_000;
  return {
    kit: 'gunner',
    role: 'gunner',
    resources: [
      { name: 'heat', frac: heat, band: kit.heatBand, marks: [def.heat.pierceAbove, def.heat.overpenAbove, 1] },
    ],
    abilities: gunnerAbilities(def, kit),
    lineAllies: lineAlliesOf(
      sim,
      e,
      def.attack.range * (kit.stance === STANCE.braced ? 1 + def.brace.rangeBonus : 1),
      def.heat.lineHalfWidth,
    ),
    gunner: {
      heat,
      spin: kit.spin,
      braced: kit.stance === STANCE.braced,
      locked: kit.lockTicks > 0,
      furnaceActive: kit.furnaceTicks > 0,
      attackRange: def.attack.range,
      bracedRange: def.attack.range * (1 + def.brace.rangeBonus),
      arcCos: halfAngleCos(def.brace.arcDegrees),
      ventCos: halfAngleCos(def.vent.coneDegrees),
      lineHalfWidth: def.heat.lineHalfWidth,
      paviseRange: def.pavise.range,
      paviseHalfLength: def.pavise.halfLength,
      pierceAbove: def.heat.pierceAbove,
      overpenAbove: def.heat.overpenAbove,
    },
  };
}
