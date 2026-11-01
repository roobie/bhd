// The control reducer: (ControlState, UiAction, ctx) -> {state, commands}. Owner: w7-input.
// STUB from the contracts slice: signatures are final, bodies are not written.

import type { ControlContext, ControlState, ReduceResult, UiAction } from './types.ts';

/** Idle controls with hero slot `selected` selected. */
export function initialControls(_selected: number): ControlState {
  throw new Error('not implemented');
}

/**
 * Pure. Delegates to `reduceArming` (arming.ts) first and processes what it leaves unhandled.
 * Rules (DESIGN "Input -> commands"): commands only for driven, live heroes (hero id from
 * `ctx.p.heroes`, matched by slot); `select` never emits; `primary` with nothing pending moves the
 * selected driven hero (to the picked unit's position when `unit` is set); `secondary` moves, or
 * cancels an aim; `cast` casts instant abilities, else starts aiming per
 * `abilityPresentation(...).targeting`; `primary`/`castAt` confirm an aim (`direction`/`point`: x, y;
 * `unit`: `target` when a unit was picked, else none); `autocast` emits `autocast {on: !current}`
 * using `HeroView.autocast`; `stop`; `hold {on: !current}`; `cancel` returns to idle; `pause`
 * toggles `state.paused`; `restart` is ignored; `hover` stores the cursor. Every emitted command
 * passes `isValidCommand`. Never switches on hero, kit or effect names.
 */
export function reduce(state: ControlState, _action: UiAction, _ctx: ControlContext): ReduceResult {
  return { state, commands: [] };
}
