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
  /** How long a combo window stays open after its status zone appears. */
  readonly comboWindowSeconds: number;
}

export function defaultPerception(): PerceptionDef {
  return { clumpRadius: 5, threatRadius: 12, lowHpFrac: 0.4, memorySeconds: 6, comboWindowSeconds: 3 };
}
