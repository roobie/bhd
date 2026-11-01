// Psyker "Warp Gambler" (D-4TKP7DQRMLBK6K7W, reduced kit D-ZQ7UANKFTPZIMMZW): Warp raises spell
// power, casts above 50 Warp risk a visible, seeded Discharge backlash (ff splash around him).
// Gravitic Lash (slot 0) pulls and Clumps. B's numbers from the w6 design checkpoint, rough first
// values. Authored in seconds / per-second units; Warp is 0..max points. w = Warp / max below.

import type { UnitDefBase } from '../types.ts';

interface WarpDef {
  readonly max: number;
  /** Warp lost per second (always, in this reduced kit). */
  readonly decayPerSecond: number;
  /** Spell power bonus per Warp point (0.01 = +1%). */
  readonly powerPerPoint: number;
  /**
   * Warp gained per basic-attack hit. Knob (B has not answered PLAN risk 1): with only Lash (+20
   * every 10 s) against 4/s decay, Warp never builds, so basic attacks feed it. Default 4.
   */
  readonly perHit: number;
}

interface BacklashDef {
  /** No chance at or below this Warp. */
  readonly freeBelow: number;
  /** Chance per Warp point above `freeBelow` (0.012 = 1.2%), rolled per cast on the kit RNG. */
  readonly chancePerPoint: number;
  /** Discharge: `baseDamage + Warp` as `ff` `splash` within `radius` of him. */
  readonly baseDamage: number;
  readonly radius: number;
}

interface LashDef {
  readonly cooldown: number;
  /** Cast range from him to the pull point. */
  readonly range: number;
  /** Pull radius is `radius + radiusPerW * w`. */
  readonly radius: number;
  readonly radiusPerW: number;
  /** Pull distance is `distance + distancePerW * w`. */
  readonly distance: number;
  readonly distancePerW: number;
  /** Clumped value is `clumped + clumpedPerW * w`, for `clumpedSeconds`. */
  readonly clumped: number;
  readonly clumpedPerW: number;
  readonly clumpedSeconds: number;
  /** Warp gained by the cast. */
  readonly warpGain: number;
}

export interface PsykerDef extends UnitDefBase {
  readonly kit: 'psyker';
  readonly warp: WarpDef;
  readonly backlash: BacklashDef;
  readonly lash: LashDef;
}

export function psykerDef(): PsykerDef {
  return {
    id: 'psyker',
    kit: 'psyker',
    radius: 0.5,
    maxHp: 320,
    armour: 0,
    speed: 4,
    attack: { damage: 14, range: 11, cooldown: 1 },
    warp: { max: 100, decayPerSecond: 4, powerPerPoint: 0.01, perHit: 4 },
    backlash: { freeBelow: 50, chancePerPoint: 0.012, baseDamage: 60, radius: 4 },
    lash: {
      cooldown: 10,
      range: 12,
      radius: 5,
      radiusPerW: 2,
      distance: 4,
      distancePerW: 3,
      clumped: 0.3,
      clumpedPerW: 0.2,
      clumpedSeconds: 2,
      warpGain: 20,
    },
  };
}
