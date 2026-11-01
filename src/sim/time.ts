// Time helpers. Content is authored in seconds and per-second units; sim logic counts integer
// ticks only. Convert once, at spawn or at the point of use, with these.

export const TICK_HZ = 30;

/** Whole ticks for a duration in seconds, rounded to nearest (halves round up). Never negative. */
export function ticks(seconds: number): number {
  return Math.max(0, Math.round(seconds * TICK_HZ));
}

/** A per-second rate (speed, regen, damage per second) as an amount per tick. */
export function perTick(perSecond: number): number {
  return perSecond / TICK_HZ;
}
