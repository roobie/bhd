// Penitent bot weights (data). Owner: slice A (w8). Keys are `penitent.<decision>.<term>`; read them with
// `weight(ctx.weights, key, DEFAULTS[key] ?? 0)`; doctrines override by key.
// Scores are "value minus cost" in arbitrary points (~40 = one decent reason to act). Numbers are STARTING
// values, free to tune. Kit geometry (ability radii) comes from perception; the few copies below
// (`geo.*`) are the numbers perception does not carry.

export function penitentWeights(): Record<string, number> {
  return {
    // ---- geometry
    'penitent.geo.view': 22,
    'penitent.geo.novaRadius': 7,
    'penitent.geo.speed': 3.5,
    'penitent.geo.stopShort': 1.5,
    'penitent.lowHp': 0.4,

    // ---- penitent.post: post / engage / pull (hold the reserved Martyrdom spot) / hold
    'penitent.post.pull': 30,
    'penitent.post.retreat': 25,
    'penitent.post.engage': 55,
    'penitent.post.leashCost': 40,
    'penitent.post.threatCost': 30,
    'penitent.post.holdBase': 8,
    'penitent.post.holdEngaged': 20,
    'penitent.post.reserved': 500,

    // ---- penitent.chain: wait / chain (Taunt + Exposed)
    'penitent.chain.perEnemy': 10,
    'penitent.chain.perEnemyCap': 6,
    'penitent.chain.ally': 30,
    'penitent.chain.allyThreat': 0.15,
    'penitent.chain.cost': 12,
    'penitent.chain.waitBase': 4,

    // ---- penitent.martyrdom: wait / martyrdom (on its own; doctrine.ultimate sets the price)
    'penitent.martyrdom.perEnemy': 8,
    'penitent.martyrdom.perEnemyCap': 10,
    'penitent.martyrdom.pain': 70,
    'penitent.martyrdom.distress': 30,
    'penitent.martyrdom.lowHp': 40,
    'penitent.martyrdom.costFree': 10,
    'penitent.martyrdom.costSpike': 75,
    'penitent.martyrdom.costCombo': 130,

    // ---- penitent.reserve (against a 'pull' intent)
    'penitent.reserve.martyrdom': 100,
    'penitent.reserve.reach': 10,
    'penitent.reserve.offsetSeconds': 0.3,
    'penitent.reserve.marginSeconds': 0.8,
    'penitent.reserve.costFree': 5,
    'penitent.reserve.costSpike': 30,
    'penitent.reserve.costCombo': 40,
    'penitent.reserve.heldAbility': 1000,
  };
}
