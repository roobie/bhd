// Wave master and Director content. Owner: director (numbers are STARTING values, free to tune).
// `MasterDef` configures the SIM side (sim/master.ts): budget, costs, unlocks and the send window.
// `DirectorDef` configures the bot side (src/director): cadence, tension model and spend mix.
// Authored in seconds / per-second units. The roster (cost and unlock wave per enemy def) is one
// table feeding both defaults, so the sim's refusals and the Director's choices agree; a custom
// config that diverges only costs the Director refused (no-op) summons.

/** What one unit of an enemy def costs the wave master, and from which wave it may be bought. Defs not listed cannot be summoned. */
interface MasterCost {
  readonly def: string;
  readonly cost: number;
  /** First wave (1-based) this def may be summoned for. Absent: from wave 1. */
  readonly unlockWave?: number;
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
  /** Tension level per point of team damage in the perception window (hp fraction of the team total). */
  readonly damageGain: number;
  /** Tension gained per second per hero at or below `lowHpFrac`. */
  readonly lowHpGain: number;
  /** A hero at or below this hp fraction counts as low (the Director applies its own threshold). */
  readonly lowHpFrac: number;
  /** Tension level per leak in the perception window. */
  readonly leakGain: number;
  /** Tension lost per second. */
  readonly decayPerSecond: number;
  /** Phase thresholds: build -> peak above `peakAbove`; peak -> relax at/below `relaxBelow`. */
  readonly peakAbove: number;
  readonly relaxBelow: number;
  /** Relax lasts this long, then the phase is build again. */
  readonly relaxSeconds: number;
}

/** One buyable enemy def in the Director's mix. */
interface MixEntry {
  readonly def: string;
  /** Relative chance to be the def bought on a think. */
  readonly weight: number;
}

/** Per phase: the fraction of the master's money (budget + pending) the Director leaves unspent. */
interface KeepFrac {
  readonly build: number;
  readonly peak: number;
  readonly relax: number;
}

export interface DirectorDef {
  /** The Director's own reaction delay (see Match: command scheduled at decision tick + this). */
  readonly reactionSeconds: number;
  /** Think cadence. Tension is advanced by this many seconds per think. */
  readonly thinkSeconds: number;
  readonly tension: TensionDef;
  /** What the Director may buy. Buys in build, sends the pending wave at peak, saves in relax. */
  readonly mix: readonly MixEntry[];
  readonly keepFrac: KeepFrac;
  /** Most units of one def bought by one summon. */
  readonly maxPerThink: number;
}

const ROSTER: readonly (MasterCost & { readonly weight: number })[] = [
  { def: 'grunt', cost: 1, weight: 4 },
  { def: 'runner', cost: 1, unlockWave: 2, weight: 3 },
  { def: 'brute', cost: 3, unlockWave: 3, weight: 2 },
  { def: 'boss', cost: 10, unlockWave: 5, weight: 1 },
];

export function defaultMaster(): MasterDef {
  return {
    budgetPerWave: [8, 10, 12, 14, 18, 18, 20, 22, 24, 28, 28, 30, 32, 34, 40],
    costs: ROSTER.map((r) =>
      r.unlockWave === undefined
        ? { def: r.def, cost: r.cost }
        : { def: r.def, cost: r.cost, unlockWave: r.unlockWave },
    ),
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
      relaxSeconds: 8,
    },
    mix: ROSTER.map((r) => ({ def: r.def, weight: r.weight })),
    keepFrac: { build: 0, peak: 0.25, relax: 0.8 },
    maxPerThink: 4,
  };
}
