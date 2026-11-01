// The seam the feedback layer (callouts, hitstop, stings) plugs into the shell through. Owner: w8-solo-loop.
// The shell calls `onStep` after every sim step and reads `visualTime` for render and effect time.
// Nothing here may touch the sim: hitstop dilates visual time only while the sim keeps stepping.

import type { SimEvent } from '../../sim/events.ts';
import type { Snapshot } from './types.ts';

export interface FeedbackSink {
  /** Called once per sim step with that step's events, the snapshot before it and the real clock (ms). */
  onStep: (events: readonly SimEvent[], prevSnap: Snapshot | undefined, nowMs: number) => void;
  /** Maps the real clock to the render/effect clock (ms); identity when nothing is dilating time. */
  visualTime: (nowMs: number) => number;
}
