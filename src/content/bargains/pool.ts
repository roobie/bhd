// The shipped bargain pool (wave 9 slice B, B's six approved entries). Each is a gain bought with a
// cost on another axis, written in the closed `Effect` vocabulary of ../bargains.ts. The pillar is
// that declining is a valid strategy: each header names when declining is the right call.
// Nothing here touches the Ancient except Blood Tithe's heal (D-2PNKLSQWVJEBSWPI).

import type { BargainDef, BargainsDef } from '../bargains.ts';

/**
 * Unvented Barrel (Gunner). Gain: basic damage x1.4. Cost: heat never decays.
 * Decline when she fights in bursts with gaps she relies on to cool off, or has no room to vent:
 * heat then only climbs, so she overheats and reaches the ff overpen band every fight.
 */
const unventedBarrel: BargainDef = {
  id: 'unvented-barrel',
  scope: 'hero',
  kit: 'gunner',
  gains: [{ kind: 'def', target: 'self', path: 'attack.damage', op: 'mul', value: 1.4 }],
  costs: [{ kind: 'def', target: 'self', path: 'heat.decayPerSecond', op: 'mul', value: 0 }],
};

/**
 * Iron Discipline (Gunner). Gain: her overpenetration line stops hitting allies. Cost: her rounds
 * never pierce armour (outside Furnace Heart; the pierce threshold moves to full heat, which is overheat).
 * Decline when armoured Brutes lead the waves or no ally ever stands in her line: the safety buys nothing.
 */
const ironDiscipline: BargainDef = {
  id: 'iron-discipline',
  scope: 'hero',
  kit: 'gunner',
  gains: [{ kind: 'def', target: 'self', path: 'heat.overpenAllies', op: 'mul', value: 0 }],
  costs: [{ kind: 'def', target: 'self', path: 'heat.pierceAbove', op: 'add', value: 0.4 }],
};

/**
 * Hair Shirt (Penitent). Gain: Wound-Zeal max bonus x1.5. Cost: heals on him x0.
 * Decline when the team leans on healing him, or he cannot stay low on hp safely: zeal is only
 * worth it while he survives at low health.
 */
const hairShirt: BargainDef = {
  id: 'hair-shirt',
  scope: 'hero',
  kit: 'penitent',
  gains: [{ kind: 'def', target: 'self', path: 'zeal.maxBonus', op: 'mul', value: 1.5 }],
  costs: [{ kind: 'healTaken', target: 'self', value: 0 }],
};

/**
 * Open the Eye (Psyker). Gain: Lash cooldown x0.6. Cost: backlash starts at 30 Warp, not 50.
 * Decline when allies crowd the front or he cannot keep Warp low: the faster Lash feeds Warp and
 * the earlier backlash then hurts the friends he is standing among.
 */
const openTheEye: BargainDef = {
  id: 'open-the-eye',
  scope: 'hero',
  kit: 'psyker',
  gains: [{ kind: 'def', target: 'self', path: 'lash.cooldown', op: 'mul', value: 0.6 }],
  costs: [{ kind: 'def', target: 'self', path: 'backlash.freeBelow', op: 'mul', value: 0.6 }],
};

/**
 * Blood Tithe (team). Gain: the Ancient heals 25% of max hp, once. Cost: respawn timers x1.5 for
 * the rest of the game. Decline when the Ancient is nearly full or heroes keep dying: a heal is
 * wasted at full hp and slower respawns compound with every death.
 */
const bloodTithe: BargainDef = {
  id: 'blood-tithe',
  scope: 'team',
  gains: [{ kind: 'ancientHeal', target: 'team', value: 0.25 }],
  costs: [{ kind: 'respawn', target: 'team', value: 1.5 }],
};

/**
 * Call the Horde (team). Gain: every hero deals x1.2 damage. Cost: +2 Runners in every later wave
 * (in master mode a wave-master budget instead). Decline when leaks already happen or the lanes
 * are stretched: more Runners reach the Ancient faster than a flat 20% damage kills them.
 */
const callTheHorde: BargainDef = {
  id: 'call-the-horde',
  scope: 'team',
  gains: [{ kind: 'dealt', target: 'team', value: 1.2 }],
  costs: [
    { kind: 'waveExtra', target: 'team', def: 'runner', count: 2 },
    { kind: 'masterBudget', target: 'team', value: 3 },
  ],
};

/** The shipped bargain rules (on in `defaultGame`). */
export function defaultBargains(): BargainsDef {
  return {
    afterWaves: [3, 6, 9, 12],
    cards: 3,
    windowSeconds: 20,
    pauseWaves: false,
    declineAncientHeal: 0.04,
    pool: [unventedBarrel, ironDiscipline, hairShirt, openTheEye, bloodTithe, callTheHorde],
  };
}
