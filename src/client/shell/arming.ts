// Arming sub-reducer: arm, reserve and cancel intents. Owner: w7-arming. Called by controls.ts.
// STUB from the contracts slice: signatures are final, bodies are not written.

import type { ArmingState, ArmStep, ControlContext, UiAction } from './types.ts';

/** Default fire time in half seconds (2 s), and the allowed range (1-5 s). */
export const ARM_DEFAULT_HALF_SECONDS = 4;
export const ARM_MIN_HALF_SECONDS = 2;
export const ARM_MAX_HALF_SECONDS = 10;

/** Not arming, arm toggle off. */
export function initialArming(): ArmingState {
  return {
    armOn: false,
    phase: 'off',
    slot: -1,
    x: 0,
    y: 0,
    fireHalfSeconds: ARM_DEFAULT_HALF_SECONDS,
    intent: 0,
    offsetHalfSeconds: 0,
  };
}

/**
 * Handles the arming-related part of an action for the selected hero slot `selected`:
 * `armToggle`; `cast` while `armOn` and the ability is armable (starts `aim`, or goes straight to
 * `time` for `instant` targeting at the hero's position); `primary`/`castAt` in `aim` (sets the
 * point, goes to `time`); `fireTime`/`armConfirm` in `time` (confirm emits `intent post {hero, slot,
 * intentKind: intentKindOf(presentation), x, y, fireIn: ticks}`); `pickIntent` (select a bot's
 * intent, phase `reserve`); `cast` in `reserve` (emits `intent reserve {hero, intent, slot,
 * offset}`); `reserveOffset`; `cancelIntent` (emits `intent cancel`); `cancel` backs out to `off`.
 * Returns `handled: false` for anything else. Commands are only emitted for driven, live heroes,
 * and every emitted command passes `isValidCommand`. Refuses (no command, a `hint`) where the
 * board would only log a no-op: a second pending post by the same hero, reserving one's own
 * intent, reserving after `fireTick`.
 */
export function reduceArming(arming: ArmingState, _action: UiAction, _ctx: ControlContext, _selected: number): ArmStep {
  return { arming, commands: [], handled: false };
}
