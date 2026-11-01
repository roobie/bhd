// The control reducer: (ControlState, UiAction, ctx) -> {state, commands}. Owner: w7-input.

import { abilityPresentation } from '../../content/presentation.ts';
import type { HeroView } from '../../perception/types.ts';
import type { Command } from '../../sim/commands.ts';
import { initialArming, reduceArming } from './arming.ts';
import type { ControlContext, ControlState, ReduceResult, UiAction } from './types.ts';

/** Ticks a hint stays up (2 s at 30 Hz). */
const HINT_TICKS = 60;

/** Idle controls with hero slot `selected` selected. */
export function initialControls(selected: number): ControlState {
  return { selected, aim: undefined, cursor: undefined, arming: initialArming(), paused: false, hint: undefined };
}

function withHint(state: ControlState, ctx: ControlContext, text: string): ControlState {
  return { ...state, hint: { text, untilTick: ctx.p.tick + HINT_TICKS } };
}

/** The selected hero when a human drives it and it is alive. */
function drivenHero(state: ControlState, ctx: ControlContext): HeroView | undefined {
  if (!ctx.driven.includes(state.selected)) {
    return undefined;
  }
  return ctx.p.heroes.find((h) => h.slot === state.selected);
}

function reduceCast(state: ControlState, hero: HeroView, ctx: ControlContext, slot: number): ReduceResult {
  if (state.aim?.slot === slot) {
    return { state: { ...state, aim: undefined }, commands: [] };
  }
  const ability = hero.abilities.find((a) => a.slot === slot);
  if (ability === undefined) {
    return { state, commands: [] };
  }
  if (!ability.ready) {
    return { state: withHint(state, ctx, 'not ready'), commands: [] };
  }
  const { targeting } = abilityPresentation(ctx.ui, ability.effect, ability);
  if (targeting === 'instant') {
    return { state: { ...state, aim: undefined }, commands: [{ kind: 'ability', hero: hero.id, slot }] };
  }
  return { state: { ...state, aim: { slot, targeting } }, commands: [] };
}

/** An ability command for `slot` aimed at a point or a unit, per targeting. */
function aimedCommand(hero: HeroView, ctx: ControlContext, slot: number, at: AimPoint): Command | undefined {
  const ability = hero.abilities.find((a) => a.slot === slot);
  if (ability === undefined) {
    return undefined;
  }
  const { targeting } = abilityPresentation(ctx.ui, ability.effect, ability);
  switch (targeting) {
    case 'instant':
      return { kind: 'ability', hero: hero.id, slot };
    case 'unit':
      return at.unit === undefined
        ? { kind: 'ability', hero: hero.id, slot }
        : { kind: 'ability', hero: hero.id, slot, target: at.unit };
    case 'direction':
    case 'point':
      return { kind: 'ability', hero: hero.id, slot, x: at.x, y: at.y };
    default:
      return undefined;
  }
}

interface AimPoint {
  readonly x: number;
  readonly y: number;
  readonly unit?: number;
}

function reduceConfirm(
  state: ControlState,
  hero: HeroView,
  ctx: ControlContext,
  req: { readonly slot: number; readonly at: AimPoint },
): ReduceResult {
  const ability = hero.abilities.find((a) => a.slot === req.slot);
  if (ability === undefined) {
    return { state: { ...state, aim: undefined }, commands: [] };
  }
  if (!ability.ready) {
    return { state: withHint({ ...state, aim: undefined }, ctx, 'not ready'), commands: [] };
  }
  const cmd = aimedCommand(hero, ctx, req.slot, req.at);
  return { state: { ...state, aim: undefined }, commands: cmd === undefined ? [] : [cmd] };
}

function reducePrimary(state: ControlState, hero: HeroView, ctx: ControlContext, at: AimPoint): ReduceResult {
  if (state.aim !== undefined) {
    return reduceConfirm(state, hero, ctx, { slot: state.aim.slot, at });
  }
  const dest = at.unit === undefined ? at : (unitPosition(ctx, at.unit) ?? at);
  return { state, commands: [{ kind: 'move', hero: hero.id, x: dest.x, y: dest.y }] };
}

function unitPosition(ctx: ControlContext, id: number): AimPoint | undefined {
  return ctx.p.enemies.find((e) => e.id === id) ?? ctx.p.heroes.find((h) => h.id === id);
}

function reduceToggle(state: ControlState, hero: HeroView, action: UiAction): ReduceResult {
  switch (action.kind) {
    case 'autocast': {
      if (!hero.abilities.some((a) => a.slot === action.slot)) {
        return { state, commands: [] };
      }
      const on = ((hero.autocast >> action.slot) & 1) === 0;
      return { state, commands: [{ kind: 'autocast', hero: hero.id, slot: action.slot, on }] };
    }
    case 'stop':
      return { state, commands: [{ kind: 'stop', hero: hero.id }] };
    case 'hold':
      return { state, commands: [{ kind: 'hold', hero: hero.id, on: !hero.hold }] };
    default:
      return { state, commands: [] };
  }
}

function reduceHero(state: ControlState, hero: HeroView, action: UiAction, ctx: ControlContext): ReduceResult {
  switch (action.kind) {
    case 'primary':
      return reducePrimary(state, hero, ctx, action);
    case 'secondary':
      if (state.aim !== undefined) {
        return { state: { ...state, aim: undefined }, commands: [] };
      }
      return { state, commands: [{ kind: 'move', hero: hero.id, x: action.x, y: action.y }] };
    case 'cast':
      return reduceCast(state, hero, ctx, action.slot);
    case 'castAt':
      return reduceConfirm(state, hero, ctx, { slot: action.slot, at: action });
    case 'autocast':
    case 'stop':
    case 'hold':
      return reduceToggle(state, hero, action);
    default:
      return { state, commands: [] };
  }
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
export function reduce(state: ControlState, action: UiAction, ctx: ControlContext): ReduceResult {
  const step = reduceArming(state.arming, action, ctx, state.selected);
  let next: ControlState = { ...state, arming: step.arming };
  if (step.clearAim === true) {
    next = { ...next, aim: undefined };
  }
  if (step.hint !== undefined) {
    next = withHint(next, ctx, step.hint);
  }
  if (step.handled) {
    return { state: next, commands: step.commands };
  }
  switch (action.kind) {
    case 'select':
      if (action.slot < 0 || action.slot > 3 || !Number.isInteger(action.slot)) {
        return { state: next, commands: [] };
      }
      return { state: { ...next, selected: action.slot, aim: undefined }, commands: [] };
    case 'hover':
      return { state: { ...next, cursor: { x: action.x, y: action.y } }, commands: [] };
    case 'cancel':
      return { state: { ...next, aim: undefined }, commands: [] };
    case 'pause':
      return { state: { ...next, paused: !next.paused }, commands: [] };
    default:
      break;
  }
  const allyId = action.kind === 'primary' ? action.unit : undefined;
  const ally = ctx.p.heroes.find((h) => h.id === allyId);
  if (ally !== undefined && next.aim === undefined) {
    return { state: { ...next, selected: ally.slot }, commands: [] };
  }
  const hero = drivenHero(next, ctx);
  if (hero === undefined) {
    return { state: next, commands: [] };
  }
  return reduceHero(next, hero, action, ctx);
}
