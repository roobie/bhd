// Penitent "The Scourged" (D-IL3SV332IUGDBPFW, reduced kit D-ZQ7UANKFTPZIMMZW): Pain banked from
// wounds, Wound-Zeal, Chain of Penance (slot 0) and Martyrdom (slot 3). B's numbers from the w6
// design checkpoint, rough first values: free to tune. Authored in seconds / per-second units;
// Pain is in its own points (0..max).

import type { UnitDefBase } from '../types.ts';

interface PainDef {
  /** Pain cap. */
  readonly max: number;
  /** Pain lost per second outside combat, as a fraction of max (0.05 = 5%/s). */
  readonly drainPerSecond: number;
  /** Seconds without taking damage before the drain starts. */
  readonly drainDelaySeconds: number;
  /** Friendly fire banks this many times the raw damage (D-IL3SV332IUGDBPFW: 1.5). */
  readonly friendlyFireMult: number;
  /** Heals on him restore this fraction (0.25). */
  readonly healMult: number;
}

interface ZealDef {
  /** Wound-Zeal: damage bonus fraction at 0 hp, scaling linearly with missing hp (0.6 = +60%). */
  readonly maxBonus: number;
}

interface ChainDef {
  readonly cooldown: number;
  /** Taunts and Exposes enemies within this of him. */
  readonly radius: number;
  readonly tauntSeconds: number;
}

interface MartyrdomDef {
  readonly cooldown: number;
  readonly seconds: number;
  /** Taunts everything within this of him for the duration. */
  readonly tauntRadius: number;
  /** Fraction of the incoming damage he takes as hp loss (0.5); Pain still banks the full raw damage. */
  readonly hpLossMult: number;
  /** End nova: radius, and Pain x this as `splash` damage. */
  readonly novaRadius: number;
  readonly novaPainMult: number;
  /** Knob (B has not answered, F2): does the nova hit allies (`ff`)? Default false. */
  readonly novaHitsAllies: boolean;
  /** Spent afterwards: Pain locked at 0, armour reduced, no taunt. */
  readonly spentSeconds: number;
  readonly spentArmourPenalty: number;
}

export interface PenitentDef extends UnitDefBase {
  readonly kit: 'penitent';
  readonly pain: PainDef;
  readonly zeal: ZealDef;
  readonly chain: ChainDef;
  readonly martyrdom: MartyrdomDef;
}

export function penitentDef(): PenitentDef {
  return {
    id: 'penitent',
    kit: 'penitent',
    radius: 0.8,
    maxHp: 900,
    armour: 6,
    speed: 3.5,
    attack: { damage: 18, range: 2, cooldown: 1 },
    pain: { max: 1000, drainPerSecond: 0.05, drainDelaySeconds: 3, friendlyFireMult: 1.5, healMult: 0.25 },
    zeal: { maxBonus: 0.6 },
    chain: { cooldown: 9, radius: 8, tauntSeconds: 3 },
    martyrdom: {
      cooldown: 90,
      seconds: 6,
      tauntRadius: 10,
      hpLossMult: 0.5,
      novaRadius: 7,
      novaPainMult: 0.5,
      novaHitsAllies: false,
      spentSeconds: 6,
      spentArmourPenalty: 4,
    },
  };
}
