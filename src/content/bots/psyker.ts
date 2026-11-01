// Psyker bot weights (data). Owner: slice B (w8). Keys are `psyker.<decision>.<term>`; doctrines
// override them by key (Doctrine.weights). Read in src/bots/psyker.ts through `weight()`, with the
// values below as the fallback. Scores are "value minus cost" in arbitrary points (~40 is one
// decent reason to act). Kit numbers (ranges, backlash chance) come from perception; only geometry
// the view does not carry is listed here. STARTING values, free to tune.

export function psykerWeights(): Record<string, number> {
  return {
    // ---- geometry
    // Discharge radius (content backlash.radius), plus a margin: allies this close can eat a backlash.
    'psyker.geo.dischargeRadius': 4,
    'psyker.geo.dischargeMargin': 1.5,
    // Stand this fraction of the Lash range from the nearest enemy when going forward.
    'psyker.geo.standOff': 0.8,

    // ---- psyker.stand: post / forward
    'psyker.stand.post': 10,
    'psyker.stand.forward': 16,
    'psyker.stand.travel': 4,
    'psyker.stand.danger': 30,

    // ---- psyker.fire: fire / hold (hold when a backlash would hit allies)
    'psyker.fire.value': 40,
    'psyker.fire.holdBase': 6,
    // Cost per ally in Discharge reach, scaled by the backlash chance and discounted by doctrine risk.
    'psyker.fire.allyCost': 120,

    // ---- psyker.lash: wait / intent / cast
    'psyker.lash.perEnemy': 8,
    'psyker.lash.perEnemyCap': 10,
    'psyker.lash.minClump': 3,
    // Lead of a posted pull intent: longer than the Gunner's reaction delay (L-KQN4NFNYHTDB6VAL).
    'psyker.lash.fireInSeconds': 4.5,
    'psyker.lash.coordination': 10,
    'psyker.lash.directFactor': 0.6,
    'psyker.lash.cost': 12,
    'psyker.lash.waitBase': 4,
    // Cost per ally in Discharge reach, scaled by the backlash chance and discounted by doctrine risk.
    'psyker.lash.allyCost': 200,
    // Clump size the Lash must reach before it is worth casting at all.
    'psyker.lash.minDirect': 2,
  };
}
