// Status definitions. Owner: combat-core. Semantics beyond Suppressed (slow) are provisional.
// PLACEHOLDER numbers. Combo statuses last 2-4 s (project DESIGN.md pillar 2) so they chain into a
// loop. Appliers pass `value` to applyStatus; combat reads the instance's value, not this table.

import type { StatusDef } from './types.ts';

export function defaultStatuses(): StatusDef[] {
  return [
    // value: fraction of movement speed removed.
    { id: 'suppressed', duration: 3, value: 0.4 },
    // value: extra damage taken as a fraction, consumed by the next hit that lands (provisional).
    { id: 'marked', duration: 4, value: 0.25 },
    // value: flat armour removed while it lasts (armour floors at 0; provisional).
    { id: 'exposed', duration: 3, value: 5 },
    // value: extra damage taken as a fraction from line/cone/splash-tagged hits (provisional).
    // Applied by the stand-in pull (stand-in-heroes slice).
    { id: 'clumped', duration: 2, value: 0.3 },
    // src = the taunter. Enemy aggro targets a live taunter first (see sim/enemies.ts). value: unused.
    { id: 'taunted', duration: 3, value: 0 },
    // Zero movement speed and no move commands. The Brace mechanism; value: unused.
    { id: 'rooted', duration: 1, value: 0 },
  ];
}
