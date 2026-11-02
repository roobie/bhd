// How a bargain's `def` patches read on a card (wave 9). Content, not code: one entry per hero-def
// path a shipped bargain patches, with a label, the unit its numbers print in, and optionally a
// sentence for the result. `describeBargain` (content/help.ts) looks paths up here; a path without an
// entry falls back to a generated label and a relative change, so a new bargain still reads.

/** How a number of a path prints. `percent` takes a fraction (0.6 prints 60%). */
export type PathUnit = 'plain' | 'percent' | 'seconds';

export interface PathText {
  readonly label: string;
  readonly unit: PathUnit;
  /** The sentence for a known base: `to` and `from` are already printed in `unit`. */
  readonly say?: (to: string, from: string) => string;
  /** What reads when the patched value is exactly 0 (a multiplier of 0, or a sum that cancels). */
  readonly zero?: string;
}

/** A number of at most one decimal, trailing zero dropped. */
function plain(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** `n` printed in `unit`. */
export function showUnit(unit: PathUnit, n: number): string {
  switch (unit) {
    case 'percent':
      return `${plain(n * 100)}%`;
    case 'seconds':
      return `${plain(n)}s`;
    default:
      return plain(n);
  }
}

/** Hero-def paths by dotted name. */
export const BARGAIN_PATHS: Readonly<Record<string, PathText>> = {
  'attack.damage': { label: 'Basic attack damage', unit: 'plain' },
  'heat.decayPerSecond': {
    label: 'Heat cooling while idle',
    unit: 'percent',
    say: (to, from) => `Heat cools ${to} per second while idle (was ${from})`,
    zero: 'Heat never cools off by itself',
  },
  'heat.overpenAllies': {
    label: 'Overpenetration hitting allies',
    unit: 'plain',
    zero: 'Overpenetration spares allies',
  },
  'heat.pierceAbove': {
    label: 'Armour-piercing heat',
    unit: 'percent',
    say: (to, from) => `Rounds pierce armour only above ${to} heat (was ${from})`,
  },
  'zeal.maxBonus': {
    label: 'Wound-Zeal max bonus',
    unit: 'percent',
    say: (to, from) => `Wound-Zeal bonus tops out at +${to} damage (was +${from})`,
  },
  'lash.cooldown': {
    label: 'Gravitic Lash cooldown',
    unit: 'seconds',
    say: (to, from) => `Gravitic Lash cooldown ${to} (was ${from})`,
  },
  'backlash.freeBelow': {
    label: 'Backlash threshold (Warp)',
    unit: 'plain',
    say: (to, from) => `Backlash starts at ${to} Warp (was ${from})`,
  },
};
