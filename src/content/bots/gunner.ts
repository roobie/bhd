// Gunner bot weights. Owner: gunner-bot. Keys are `gunner.<decision>.<term>`; doctrines override
// them by key (Doctrine.weights). Read in src/bots/gunner.ts through `weight()` (bots/utility.ts),
// with the values below as the fallback, so a setup that omits a key still plays.
//
// Scores are "value minus cost" in arbitrary points: ~40 is one decent shot's worth of reason to
// act. Kit geometry (ranges, cones, heat bands) is read from perception, not copied here. Numbers are STARTING values, free to tune.

export function gunnerWeights(): Record<string, number> {
  return {
    // ---- geometry (the kit's own numbers come from perception: GunnerView and AbilityView.range)
    'gunner.geo.flankRange': 8,
    'gunner.geo.view': 22,
    'gunner.geo.allyRadius': 0.6,
    'gunner.geo.enemyRadius': 0.5,
    'gunner.lowHp': 0.35,

    // ---- gunner.post: post / advance / hold
    'gunner.post.pull': 30,
    'gunner.post.retreat': 40,
    'gunner.post.advance': 40,
    'gunner.post.leashCost': 60,
    'gunner.post.threatCost': 80,
    'gunner.post.holdBase': 8,
    'gunner.post.holdEngaged': 28,
    'gunner.post.spinCost': 12,

    // ---- gunner.stance: free / brace
    'gunner.stance.arc': 9,
    'gunner.stance.arcCap': 8,
    'gunner.stance.spin': 10,
    'gunner.stance.flank': 14,
    'gunner.stance.root': 60,
    'gunner.stance.lowHp': 25,
    'gunner.stance.aggro': 20,
    'gunner.stance.freeBase': 12,
    'gunner.stance.freeMobile': 20,
    'gunner.stance.unbrace': 6,
    'gunner.stance.setup': 4,

    // ---- gunner.fire: fire / hold (pillar 1: allies in the overpenetration line cost)
    'gunner.fire.value': 40,
    'gunner.fire.clump': 0.2,
    'gunner.fire.clumpCap': 3,
    'gunner.redline.allyInLine': 50,
    'gunner.fire.anticipation': 0.5,
    'gunner.fire.overheatAvoid': 60,

    // ---- gunner.vent
    'gunner.vent.minHeat': 0.12,
    'gunner.vent.damage': 40,
    'gunner.vent.urgency': 80,
    'gunner.vent.allyRelief': 40,
    'gunner.vent.spinCost': 25,
    'gunner.vent.waitBase': 6,
    'gunner.vent.furnaceCost': 200,

    // ---- gunner.pavise: wait / shield / block. Costs: its cooldown, and the reach lost past the barrier
    // (enemies on her line behind it, weighted by how live the overpen line is, never below reachFloor).
    'gunner.pavise.waitBase': 6,
    'gunner.pavise.selfBlock': 300,
    'gunner.pavise.shield': 60,
    'gunner.pavise.penitentBonus': 1,
    'gunner.pavise.gap': 0.8,
    'gunner.pavise.minReach': 1.5,
    'gunner.pavise.cooldown': 25,
    'gunner.pavise.reachLoss': 30,
    'gunner.pavise.reachFloor': 0.3,
    'gunner.pavise.pushRange': 8,
    'gunner.pavise.minEnemies': 3,
    'gunner.pavise.blockPush': 14,
    'gunner.pavise.blockCap': 6,
    'gunner.pavise.blockThreat': 100,
    'gunner.pavise.blockLowHp': 30,
    'gunner.pavise.blockGap': 1.6,

    // ---- gunner.furnace (doctrine.ultimate: free / spike / combo)
    'gunner.furnace.perEnemy': 7,
    'gunner.furnace.perEnemyCap': 12,
    'gunner.furnace.heat': 25,
    'gunner.furnace.distress': 40,
    'gunner.furnace.combo': 45,
    'gunner.furnace.comboReach': 16,
    'gunner.furnace.costFree': 5,
    'gunner.furnace.costSpike': 45,
    'gunner.furnace.costCombo': 55,
    'gunner.furnace.ventLock': 15,

    // ---- gunner.reserve (against a 'pull' intent)
    'gunner.reserve.furnace': 90,
    'gunner.reserve.vent': 90,
    'gunner.reserve.ventMaxHeat': 0.6,
    'gunner.reserve.reach': 14,
    'gunner.reserve.offsetSeconds': 0.6,
    'gunner.reserve.marginSeconds': 0.8,
    'gunner.reserve.heldAbility': 1000,
  };
}
