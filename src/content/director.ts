// Wave master and Director content. Owner: director (numbers are STARTING values, free to tune).
// `MasterDef` configures the SIM side (sim/master.ts): budget, costs and the send window.
// Authored in seconds / per-second units.

/** What one unit of an enemy def costs the wave master. Defs not listed cannot be summoned. */
interface MasterCost {
  readonly def: string;
  readonly cost: number;
}

export interface MasterDef {
  /**
   * Budget granted for wave n (1-based) is `budgetPerWave[n - 1]`, the last entry repeating
   * beyond the list. Wave 1's budget is granted at game start, wave n+1's when wave n starts.
   * Unspent budget carries over.
   */
  readonly budgetPerWave: readonly number[];
  readonly costs: readonly MasterCost[];
  /** `send` starts the pending wave early only this long after the previous wave started. */
  readonly minIntervalSeconds: number;
  /** Seconds between units of one summoned group when the wave spawns. */
  readonly gap: number;
}

export function defaultMaster(): MasterDef {
  return {
    budgetPerWave: [8, 10, 12, 14, 18, 18, 20, 22, 24, 28, 28, 30, 32, 34, 40],
    costs: [
      { def: 'grunt', cost: 1 },
      { def: 'runner', cost: 1 },
      { def: 'brute', cost: 3 },
      { def: 'boss', cost: 10 },
    ],
    minIntervalSeconds: 10,
    gap: 0.6,
  };
}
