// Perception tunables. Owner: perception. Authored in seconds and world units.

export interface PerceptionDef {
  /** Clump attach radius R (world units): an enemy joins the first clump whose centroid is within R. */
  readonly clumpRadius: number;
  /** Enemies within this distance of a hero count toward its threat. */
  readonly threatRadius: number;
  /** Heroes at or below this hp fraction count as low (team aggregate). */
  readonly lowHpFrac: number;
  /** How long damage and leak samples stay in `PerceptionMemory`. */
  readonly memorySeconds: number;
  /** Status ids that form combo windows when enough carriers sit in one clump, in output order. */
  readonly comboStatuses: readonly string[];
  /** Carriers of one status in one clump needed for a window. */
  readonly comboMinCount: number;
}

export function defaultPerception(): PerceptionDef {
  return {
    clumpRadius: 5,
    threatRadius: 12,
    lowHpFrac: 0.4,
    memorySeconds: 6,
    comboStatuses: ['clumped', 'marked', 'suppressed'],
    comboMinCount: 2,
  };
}
