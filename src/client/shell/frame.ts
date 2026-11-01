// Pure frame driver (B-C4FU2FN3T5OXCUTV). Owner: w7-viewmath.
// STUB from the contracts slice: signatures are final, bodies are not written.
//
// Contract of `planFrame`: pure (same inputs, same plan); never reads a clock. The first call
// (clock.lastMs undefined) plans 0 steps. Otherwise gap = clamp(now - lastMs, 0, maxGapMs); paused
// adds nothing; the accumulator gains gap * speed, steps = min(maxSteps, floor(acc / tickMs)), and
// the remainder carried is < tickMs (when the cap bites, the surplus is dropped). `alpha` =
// acc / tickMs in [0, 1).

import type { FrameClock, FrameOptions, FramePlan } from './types.ts';

/** 30 Hz sim, real time, no pause, 250 ms gap clamp, at most 5 steps per frame. */
export const DEFAULT_FRAME_OPTIONS: FrameOptions = {
  tickMs: 1000 / 30,
  speed: 1,
  paused: false,
  maxGapMs: 250,
  maxSteps: 5,
};

export function newFrameClock(): FrameClock {
  return { lastMs: undefined, accMs: 0 };
}

export function planFrame(clock: FrameClock, nowMs: number, opts: FrameOptions): FramePlan {
  const { tickMs } = opts;
  if (clock.lastMs === undefined) {
    return { steps: 0, alpha: 0, clock: { lastMs: nowMs, accMs: 0 } };
  }
  const gap = Math.min(Math.max(nowMs - clock.lastMs, 0), opts.maxGapMs);
  const gained = opts.paused ? 0 : gap * Math.max(opts.speed, 0);
  const acc = clock.accMs + gained;
  const due = Math.floor(acc / tickMs);
  const steps = Math.min(opts.maxSteps, due);
  // Whatever the cap refuses to run is dropped, not carried: only the sub-tick remainder stays.
  const accMs = Math.max(acc - due * tickMs, 0);
  return { steps, alpha: Math.min(accMs / tickMs, 1 - Number.EPSILON), clock: { lastMs: nowMs, accMs } };
}
