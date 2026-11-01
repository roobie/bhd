// Gunner "The Furnace" (project DESIGN.md §4.1). Owner: gunner. Numbers are STARTING values, free
// to tune. Authored in seconds / per-second units (src/content/types.ts); heat and spin are
// fractions (1 = 100%); angles in degrees; distances in world units.
//
// Pillar check (braced vs mobile): braced is clearly better when holding a lane choke against a
// slow armoured push (Brutes marching straight at her): +30% range, a spin that never decays and a
// guaranteed redline. Mobile is clearly better when divers flank, when she must reposition to
// cover a leak, or after Vent: braced she is rooted, has a 90 degree arc and needs 1 s to unbrace.

import type { UnitDefBase } from '../types.ts';

interface SpinDef {
  /** Fire-rate multiplier at zero spin (0.4 = 40%). */
  readonly min: number;
  /** Fire-rate multiplier at full spin (1.6 = 160%). */
  readonly max: number;
  /** Continuous fire needed to go from zero to full spin. */
  readonly rampSeconds: number;
  /** Moving from full spin to zero takes this long (also while firing). */
  readonly movingDrainSeconds: number;
  /** Standing still but not firing (no target, hold, vent): full to zero in this long. Never while braced. */
  readonly idleDrainSeconds: number;
}

interface HeatDef {
  /** Heat added per shot. */
  readonly perShot: number;
  /** Passive loss per second while not engaged (no target to fire at). None while firing. */
  readonly decayPerSecond: number;
  /** Above this heat, rounds carry the `pierce` tag (ignore armour). */
  readonly pierceAbove: number;
  /** Above this heat, rounds overpenetrate: a line hit that includes allies (`ff`). */
  readonly overpenAbove: number;
  /** Overheat (heat reaches 100%): no fire for this long; heat bleeds off linearly to zero. */
  readonly overheatSeconds: number;
  /** Half the width of the overpenetration line. */
  readonly lineHalfWidth: number;
}

interface BraceDef {
  /** Range bonus as a fraction (0.3 = +30%). */
  readonly rangeBonus: number;
  /** Full width of the fixed firing arc, centred on the facing at brace time. */
  readonly arcDegrees: number;
  /** Unbracing: rooted and not firing for this long. */
  readonly unbraceSeconds: number;
  /** How long the `rooted` status lasts while braced (effectively until unbraced). */
  readonly rootSeconds: number;
}

interface VentDef {
  readonly cooldown: number;
  readonly range: number;
  readonly coneDegrees: number;
  /** Damage to each target at 100% heat; scales linearly with the heat dumped. */
  readonly maxDamage: number;
}

interface PaviseDef {
  readonly cooldown: number;
  /** Farthest the barrier is placed from the Gunner. */
  readonly range: number;
  /** Half the barrier's width (1.5 = a 3-wide barrier). */
  readonly halfLength: number;
  /** How long the barrier stands. */
  readonly seconds: number;
}

interface FurnaceDef {
  readonly cooldown: number;
  /** No overheat and full overpenetration (and pierce) for this long... */
  readonly activeSeconds: number;
  /** ...then a forced vent (no fire) for this long. */
  readonly ventSeconds: number;
}

export interface GunnerDef extends UnitDefBase {
  readonly kit: 'gunner';
  readonly spin: SpinDef;
  readonly heat: HeatDef;
  readonly brace: BraceDef;
  readonly vent: VentDef;
  readonly pavise: PaviseDef;
  readonly furnace: FurnaceDef;
}

export function gunnerDef(): GunnerDef {
  return {
    id: 'gunner',
    kit: 'gunner',
    radius: 0.6,
    maxHp: 400,
    armour: 1,
    speed: 4,
    // cooldown is the period at 100% fire rate (6 ticks); spin scales it from 250% to 62.5% of that.
    attack: { damage: 8, range: 12, cooldown: 0.2 },
    spin: { min: 0.4, max: 1.6, rampSeconds: 3, movingDrainSeconds: 1, idleDrainSeconds: 2 },
    heat: {
      perShot: 0.015,
      decayPerSecond: 0.1,
      pierceAbove: 0.6,
      overpenAbove: 0.85,
      overheatSeconds: 4,
      lineHalfWidth: 0.4,
    },
    brace: { rangeBonus: 0.3, arcDegrees: 90, unbraceSeconds: 1, rootSeconds: 3600 },
    vent: { cooldown: 12, range: 10, coneDegrees: 70, maxDamage: 300 },
    pavise: { cooldown: 16, range: 6, halfLength: 1.5, seconds: 8 },
    furnace: { cooldown: 90, activeSeconds: 6, ventSeconds: 6 },
  };
}
