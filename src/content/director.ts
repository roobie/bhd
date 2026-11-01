// Wave master and Director content. Owner: director (numbers are STARTING values, free to tune).
// `MasterDef` configures the SIM side (sim/master.ts): budget, costs and the send window.
// `DirectorDef` configures the bot side (src/director): cadence, tension model and spend mix.
// Authored in seconds / per-second units.
// TODO(director slice): the content/director tension nits from the Opus review of w2-contracts
// commits 0079efa and b4d3733 (see .work/slice/U-LJEDSZA4LC22MX2H-w2-contracts/STATE.md Harvest)
// are deliberately left as they are here; the director slice owns and resolves them. Candidates
// seen while writing the stub: DirectorDef.mix vs MasterDef.costs (a def in one and not the
// other), and Director pacing (think / reaction seconds) vs MasterDef.minIntervalSeconds.

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

/** Tension accumulator tunables (src/director/tension.ts). */
interface TensionDef {
  /** Tension gained per point of team damage taken (hp fraction of the team total). */
  readonly damageGain: number;
  /** Tension gained per second per hero below `lowHpFrac`. */
  readonly lowHpGain: number;
  readonly lowHpFrac: number;
  /** Tension gained per leak. */
  readonly leakGain: number;
  /** Tension lost per second. */
  readonly decayPerSecond: number;
  /** Phase thresholds: build -> peak above `peakAbove`; peak -> relax at/below `relaxBelow`. */
  readonly peakAbove: number;
  readonly relaxBelow: number;
}

export interface DirectorDef {
  /** The Director's own reaction delay (see Match: command scheduled at decision tick + this). */
  readonly reactionSeconds: number;
  /** Think cadence. */
  readonly thinkSeconds: number;
  readonly tension: TensionDef;
  /** Enemy def ids in the order the Director prefers to buy them. */
  readonly mix: readonly string[];
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

export function defaultDirector(): DirectorDef {
  return {
    reactionSeconds: 0.5,
    thinkSeconds: 1,
    tension: {
      damageGain: 4,
      lowHpGain: 0.2,
      lowHpFrac: 0.4,
      leakGain: 0.3,
      decayPerSecond: 0.05,
      peakAbove: 0.7,
      relaxBelow: 0.3,
    },
    mix: ['grunt', 'runner', 'brute', 'boss'],
  };
}
