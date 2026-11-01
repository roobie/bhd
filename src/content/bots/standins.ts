// Stand-in hero bot weights (tank, ranged, support). Owner: standin-bots. Keys are
// `standin.<role>.<decision>.<term>`; doctrines override them by key (Doctrine.weights).

export function standinWeights(): Record<string, number> {
  return {
    // Cost charged to the tank for standing inside the Gunner's overpenetration line.
    'standin.tank.stand.inGunnerLine': 30,
  };
}
