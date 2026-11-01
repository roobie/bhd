// Gunner bot weights. Owner: gunner-bot. Keys are `gunner.<decision>.<term>`; doctrines override
// them by key (Doctrine.weights). Read in src/bots/gunner.ts through `weight()` (bots/utility.ts).

export function gunnerWeights(): Record<string, number> {
  return {
    // Cost charged to firing per ally standing in the overpenetration line (pillar 1).
    'gunner.redline.allyInLine': 50,
  };
}
