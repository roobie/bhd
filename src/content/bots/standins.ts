// Stand-in hero bot weights (tank, ranged, support). Owner: standin-bots. Keys are
// `standin.<role>.<decision>.<term>`; doctrines override them by key (Doctrine.weights). Read in
// src/bots/standins.ts through `weight()`, with these values as the fallback, so every key the
// brain reads must be listed here. Decision ids: `standin.<role>.stand | taunt | mark | heal | pull`.
// PLACEHOLDER tuning: values and costs are unitless utility, geometry is in world units.

export function standinWeights(): Record<string, number> {
  return {
    // Geometry of the Gunner's overpenetration line, derived privately from her position and target.
    'standin.line.range': 14,
    'standin.line.halfWidth': 1.2,

    // Positioning ('stand'): value of each spot, cost of travel, danger and of standing in the line.
    'standin.tank.stand.post': 1,
    'standin.tank.stand.front': 1.6,
    'standin.tank.stand.gap': 2,
    'standin.tank.stand.sidestep': 2.5,
    'standin.tank.stand.travel': 0.2,
    // Cost charged to the tank for standing inside the Gunner's overpenetration line.
    'standin.tank.stand.inGunnerLine': 30,
    // 0 on purpose: the tank's job is the front, so being forward is never charged as danger.
    'standin.tank.stand.danger': 0,
    'standin.ranged.stand.post': 1,
    'standin.ranged.stand.forward': 1,
    'standin.ranged.stand.reach': 0.85,
    'standin.ranged.stand.travel': 0.2,
    'standin.ranged.stand.danger': 2,
    'standin.ranged.stand.inGunnerLine': 30,
    'standin.support.stand.post': 1,
    'standin.support.stand.ally': 1.4,
    'standin.support.stand.travel': 0.2,
    'standin.support.stand.danger': 2,
    'standin.support.stand.inGunnerLine': 30,

    // Tank taunt.
    'standin.tank.taunt.perEnemy': 0.25,
    'standin.tank.taunt.relief': 3,
    'standin.tank.taunt.cost': 0.6,

    // Ranged mark: candidate value terms (hp, nearness to the Ancient, clump), the cost of spending
    // the cooldown, and `wait`, the value of keeping it.
    'standin.ranged.mark.hp': 1,
    'standin.ranged.mark.hpScale': 200,
    'standin.ranged.mark.front': 1,
    'standin.ranged.mark.far': 80,
    'standin.ranged.mark.clump': 0.6,
    'standin.ranged.mark.cost': 0.3,
    'standin.ranged.mark.wait': 0.7,

    // Support heal.
    'standin.support.heal.perMissing': 2.5,
    'standin.support.heal.urgent': 1,
    'standin.support.heal.urgentFrac': 0.35,
    'standin.support.heal.cost': 0.4,

    // Support pull: `minClump` enemies make a clump worth an intent; `fireInSeconds` is the lead the
    // Gunner gets to reserve against it (a think, a slow seat's reaction delay of up to ~3 s, and the
    // Gunner's reservation margin); `directFactor` discounts casting at a smaller clump.
    'standin.support.pull.perEnemy': 0.4,
    'standin.support.pull.minClump': 4,
    'standin.support.pull.fireInSeconds': 4.5,
    'standin.support.pull.coordination': 1,
    'standin.support.pull.directFactor': 0.6,
    'standin.support.pull.cost': 0.8,
  };
}
