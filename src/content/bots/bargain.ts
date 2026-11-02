// Bargain evaluator weights (wave 9 slice C). Keys are `bargain.<term>`; doctrines override them by
// key (Doctrine.weights). Read in src/bots/bargain.ts through `weight()` with these values as the
// fallback, so every key the evaluator reads must be listed here. The scorer is generic: it knows
// effect kinds, never a particular bargain. PLACEHOLDER tuning: unitless utility.

export function bargainWeights(): Record<string, number> {
  return {
    // Utility per unit of effect magnitude, by kind. Multipliers count |value - 1|; `ancientHeal`
    // counts the Ancient hp fraction actually restored; `waveExtra` counts enemies; `masterBudget`
    // counts the budget amount; an additive `def` patch counts |value| times `addScale`.
    'bargain.unit.def': 4,
    'bargain.unit.dealt': 5,
    'bargain.unit.taken': 5,
    'bargain.unit.healTaken': 2,
    'bargain.unit.respawn': 4,
    'bargain.unit.ancientHeal': 12,
    'bargain.unit.waveExtra': 0.7,
    'bargain.unit.masterBudget': 0.3,
    'bargain.addScale': 0.05,

    // Declining: a flat floor, plus the Ancient heal the game grants for it (mirrors the content's
    // declineAncientHeal; perception does not carry it), worth `unit.ancientHeal` per fraction restored.
    'bargain.decline.base': 0.35,
    'bargain.decline.heal': 0.04,

    // Situation scaling: a cost grows by (1 + weight * situation).
    // Fallen or low heroes make respawn, taken, healTaken and maxHp costs heavier.
    'bargain.scale.weakHeroes': 1.5,
    // Armoured enemies (share of the preview) make armour-pierce costs heavier.
    'bargain.scale.armoured': 1.5,
    // Leaks in the memory window make wave-extra and master-budget costs heavier.
    'bargain.scale.leaks': 0.4,
    // Allies standing in a Gunner line make friendly-fire effects (gain or cost) weigh more, per ally.
    'bargain.scale.lineAllies': 0.8,
    // All costs are multiplied by (1 - riskCut * doctrine.risk): a risk-tolerant doctrine pays less heed.
    'bargain.riskCut': 0.6,

    // Policy margin: forced policies decide by a gap far above doctrine noise.
    'bargain.policy.gap': 1000,
  };
}
