// Arming sub-reducer: arm, reserve and cancel intents. Owner: w7-arming. Called by controls.ts.
// Pure: state and action in, state and commands out. The board stays the authority; the refusals
// here are UX hints, not a copy of its rules.

import { abilityPresentation, intentKindOf } from '../../content/presentation.ts';
import type { HeroView, IntentView } from '../../perception/types.ts';
import type { Command } from '../../sim/commands.ts';
import { TICK_HZ } from '../../sim/time.ts';
import { type ArmingState, type ArmStep, type ControlContext, INPUT_DELAY_TICKS, type UiAction } from './types.ts';

/** Default fire time in half seconds (2 s), and the allowed range (1-5 s). */
export const ARM_DEFAULT_HALF_SECONDS = 4;
export const ARM_MIN_HALF_SECONDS = 2;
export const ARM_MAX_HALF_SECONDS = 10;

const TICKS_PER_HALF_SECOND = TICK_HZ / 2;
const SECOND_POST = 'a trigger is already armed for this hero';
const GONE = 'that trigger is gone';

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
    lastPost: undefined,
  };
}

function clampHalf(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(Number.isFinite(n) ? n : lo)));
}

/** Back to `off`, keeping the arm toggle and the last post. */
function backedOut(a: ArmingState): ArmingState {
  return { ...initialArming(), armOn: a.armOn, lastPost: a.lastPost };
}

function liveHero(ctx: ControlContext, selected: number): HeroView | undefined {
  return ctx.driven.includes(selected) ? ctx.p.heroes.find((h) => h.slot === selected) : undefined;
}

/** Still open when a command sent now applies (the board takes reserves and counts posts strictly before fireTick). */
function pending(i: IntentView, tick: number): boolean {
  return !i.fired && i.fireTick > tick + INPUT_DELAY_TICKS;
}

/** A post by `hero` is on the board, or was sent and has not reached it yet. */
function hasPendingPost(arming: ArmingState, ctx: ControlContext, hero: HeroView): boolean {
  const sent = arming.lastPost;
  if (sent !== undefined && sent.hero === hero.id && ctx.p.tick <= sent.untilTick) {
    return true;
  }
  return ctx.p.intents.some((i) => i.by === hero.id && pending(i, ctx.p.tick));
}

function step(arming: ArmingState, extra: Partial<ArmStep> = {}): ArmStep {
  return { arming, commands: [], handled: true, ...extra };
}

function unhandled(arming: ArmingState): ArmStep {
  return { arming, commands: [], handled: false };
}

function armableSlot(ctx: ControlContext, hero: HeroView, slot: number): boolean {
  const ab = hero.abilities.find((a) => a.slot === slot);
  return ab !== undefined && abilityPresentation(ctx.ui, ab.effect, ab).armable;
}

/** Starts arming `slot`: `instant` abilities go straight to the time picker at the hero. */
function start(arming: ArmingState, ctx: ControlContext, hero: HeroView, slot: number): ArmStep {
  if (hasPendingPost(arming, ctx, hero)) {
    return step(backedOut(arming), { hint: SECOND_POST, clearAim: true });
  }
  const ab = hero.abilities.find((a) => a.slot === slot);
  if (ab === undefined) {
    return unhandled(arming);
  }
  const instant = isInstant(ctx, ab);
  const next: ArmingState = {
    ...arming,
    phase: instant ? 'time' : 'aim',
    slot,
    x: hero.x,
    y: hero.y,
    fireHalfSeconds: ARM_DEFAULT_HALF_SECONDS,
    intent: 0,
    offsetHalfSeconds: 0,
  };
  return step(next, { clearAim: true });
}

function isInstant(ctx: ControlContext, ab: HeroView['abilities'][number]): boolean {
  return abilityPresentation(ctx.ui, ab.effect, ab).targeting === 'instant';
}

function post(arming: ArmingState, ctx: ControlContext, hero: HeroView): ArmStep {
  const done = backedOut(arming);
  if (hasPendingPost(arming, ctx, hero)) {
    return step(done, { hint: SECOND_POST, clearAim: true });
  }
  const ab = hero.abilities.find((a) => a.slot === arming.slot);
  if (ab === undefined) {
    return step(done, { clearAim: true });
  }
  // An instant ability fires where the hero stands, so the point is taken now, not when arming began.
  const at = isInstant(ctx, ab) ? hero : arming;
  const cmd: Command = {
    kind: 'intent',
    op: 'post',
    hero: hero.id,
    slot: arming.slot,
    intentKind: intentKindOf(abilityPresentation(ctx.ui, ab.effect, ab)),
    x: at.x,
    y: at.y,
    fireIn: arming.fireHalfSeconds * TICKS_PER_HALF_SECOND,
  };
  const sent = { hero: hero.id, untilTick: ctx.p.tick + INPUT_DELAY_TICKS };
  return step({ ...done, lastPost: sent }, { commands: [cmd], clearAim: true });
}

function reserve(arming: ArmingState, ctx: ControlContext, hero: HeroView, slot: number): ArmStep {
  const done = backedOut(arming);
  const intent = ctx.p.intents.find((i) => i.id === arming.intent);
  if (intent === undefined) {
    return step(done, { hint: GONE });
  }
  if (intent.by === hero.id) {
    return step(done, { hint: 'a hero cannot reserve its own trigger' });
  }
  // The command applies INPUT_DELAY_TICKS from now and the board takes reserves strictly before fireTick.
  if (intent.fired || intent.fireTick <= ctx.p.tick + INPUT_DELAY_TICKS) {
    return step(done, { hint: 'too late to reserve that trigger' });
  }
  if (!hero.abilities.some((a) => a.slot === slot)) {
    return step(arming);
  }
  const cmd: Command = {
    kind: 'intent',
    op: 'reserve',
    hero: hero.id,
    intent: intent.id,
    slot,
    offset: Math.min(arming.offsetHalfSeconds, maxOffsetHalf(ctx)) * TICKS_PER_HALF_SECOND,
  };
  return step(done, { commands: [cmd] });
}

function cancelIntent(arming: ArmingState, ctx: ControlContext, hero: HeroView, id: number): ArmStep {
  const done = backedOut(arming);
  const intent = ctx.p.intents.find((i) => i.id === id);
  if (intent === undefined) {
    return step(done, { hint: GONE });
  }
  if (intent.by !== hero.id && !intent.reservers.includes(hero.id)) {
    return step(done, { hint: 'only its owner can cancel that' });
  }
  const cmd: Command = { kind: 'intent', op: 'cancel', hero: hero.id, intent: id };
  return step(done, { commands: [cmd] });
}

/** `cast` while armed or reserving. */
function reduceCast(
  arming: ArmingState,
  action: Extract<UiAction, { kind: 'cast' }>,
  ctx: ControlContext,
  hero: HeroView,
): ArmStep {
  if (arming.phase === 'reserve') {
    return reserve(arming, ctx, hero, action.slot);
  }
  if ((arming.phase === 'aim' || arming.phase === 'time') && arming.slot === action.slot) {
    return step(backedOut(arming), { clearAim: true });
  }
  if ((arming.armOn || action.arm === true) && armableSlot(ctx, hero, action.slot)) {
    return start(arming, ctx, hero, action.slot);
  }
  return unhandled(arming);
}

function reduceCastAt(
  arming: ArmingState,
  action: Extract<UiAction, { kind: 'castAt' }>,
  ctx: ControlContext,
  hero: HeroView | undefined,
): ArmStep {
  if (hero === undefined || !armableSlot(ctx, hero, action.slot) || !(arming.armOn || arming.slot === action.slot)) {
    return unhandled(arming);
  }
  const started = start(arming, ctx, hero, action.slot);
  if (started.arming.phase === 'off') {
    return started;
  }
  return { ...started, arming: { ...started.arming, phase: 'time', x: action.x, y: action.y } };
}

/** The longest reserve offset in half seconds, from the content constant. */
export function maxOffsetHalfSeconds(maxOffsetSeconds: number): number {
  return Math.max(0, Math.floor(maxOffsetSeconds * 2));
}

function maxOffsetHalf(ctx: ControlContext): number {
  return maxOffsetHalfSeconds(ctx.maxOffsetSeconds);
}

/** `fireTime` and `reserveOffset`: nudge the value of the phase that owns it. */
function reduceNudge(arming: ArmingState, action: UiAction, ctx: ControlContext): ArmStep {
  if (action.kind === 'fireTime' && (arming.phase === 'aim' || arming.phase === 'time')) {
    const half = clampHalf(arming.fireHalfSeconds + action.halfSeconds, ARM_MIN_HALF_SECONDS, ARM_MAX_HALF_SECONDS);
    return step({ ...arming, fireHalfSeconds: half });
  }
  if (action.kind === 'reserveOffset' && arming.phase === 'reserve') {
    const half = clampHalf(arming.offsetHalfSeconds + action.halfSeconds, 0, maxOffsetHalf(ctx));
    return step({ ...arming, offsetHalfSeconds: half });
  }
  return unhandled(arming);
}

/** Actions that only matter in the `aim`/`time`/`reserve` phases. */
function reducePhase(arming: ArmingState, action: UiAction, ctx: ControlContext, hero: HeroView | undefined): ArmStep {
  switch (action.kind) {
    case 'primary':
      if (arming.phase === 'aim') {
        return step({ ...arming, phase: 'time', x: action.x, y: action.y }, { clearAim: true });
      }
      return arming.phase === 'time' && hero !== undefined ? post(arming, ctx, hero) : unhandled(arming);
    case 'secondary':
      return arming.phase === 'off' ? unhandled(arming) : step(backedOut(arming), { clearAim: true });
    case 'armConfirm':
      return arming.phase === 'time' && hero !== undefined ? post(arming, ctx, hero) : unhandled(arming);
    default:
      return reduceNudge(arming, action, ctx);
  }
}

/**
 * Handles the arming-related part of an action for the selected hero slot `selected`:
 * `armToggle`; `cast` while `armOn` and the ability is armable (starts `aim`, or goes straight to
 * `time` for `instant` targeting, posted at the hero's position at confirm); `primary`/`castAt` in `aim` (sets the
 * point, goes to `time`); `fireTime`/`armConfirm` in `time` (confirm emits `intent post {hero, slot,
 * intentKind: intentKindOf(presentation), x, y, fireIn: ticks}`); `pickIntent` (select a bot's
 * intent, phase `reserve`); `cast` in `reserve` (emits `intent reserve {hero, intent, slot,
 * offset}`); `reserveOffset`; `cancelIntent` (emits `intent cancel`); `cancel` backs out to `off`.
 * Returns `handled: false` for anything else. Commands are only emitted for driven, live heroes,
 * and every emitted command passes `isValidCommand`. Refuses (no command, a `hint`) where the
 * board would only log a no-op: a second pending post by the same hero, reserving one's own
 * intent, reserving after `fireTick`.
 */
export function reduceArming(arming: ArmingState, action: UiAction, ctx: ControlContext, selected: number): ArmStep {
  const hero = liveHero(ctx, selected);
  switch (action.kind) {
    case 'armToggle':
      return step(arming.armOn ? initialArming() : { ...arming, armOn: true }, { clearAim: true });
    case 'cancel':
      if (arming.phase !== 'off') {
        return step(backedOut(arming), { clearAim: true });
      }
      return arming.armOn ? step(initialArming()) : unhandled(arming);
    case 'cast':
      return hero === undefined ? unhandled(arming) : reduceCast(arming, action, ctx, hero);
    case 'castAt':
      return reduceCastAt(arming, action, ctx, hero);
    case 'pickIntent':
      if (hero === undefined) {
        return unhandled(arming);
      }
      return ctx.p.intents.some((i) => i.id === action.id)
        ? step({ ...arming, phase: 'reserve', slot: -1, intent: action.id, offsetHalfSeconds: 0 }, { clearAim: true })
        : step(backedOut(arming), { hint: GONE });
    case 'cancelIntent':
      return hero === undefined ? unhandled(arming) : cancelIntent(arming, ctx, hero, action.id);
    default:
      return reducePhase(arming, action, ctx, hero);
  }
}
