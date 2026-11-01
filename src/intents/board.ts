// Intents board (project DESIGN.md §6.3; wave w2-bots DESIGN "Intents board lives in the sim").
// Owner: intents.
//
// A human's armed trigger and a bot intent are the same object and fire on the lockstep tick, so
// the board is sim state (hashed) and its phase runs right after commands: `intentSystem`.
//
// Contract:
// - post: `{op:'post', hero, slot, intentKind, x, y, fireIn}`; `fireTick = applyTick + fireIn`
//   (fireIn >= 1 whole ticks); one pending (unfired, before fireTick) intent per hero; at most
//   `intents.maxLive` on the board. Emits `intent post`. Refused (logged `cmd` only) for a missing
//   or dead hero.
// - At `fireTick` the sim casts the poster's `slot` at (x, y) with `ctx.cast`: success -> `fire`,
//   failure (dead, cooldown, locked) -> `expire`.
// - reserve: `{op:'reserve', hero, intent, slot, offset}`: an armed follow-up; at `fireTick + offset`
//   the sim casts the reserver's slot at the intent point: success -> `fulfil` (by reserver),
//   failure or the intent never fired -> `expire` (by reserver). Accepted only before fireTick, one
//   per hero per intent, `offset` whole ticks <= ticks(intents.maxOffsetSeconds). No ability lock:
//   casting it early just makes the reservation expire. The reserver must be a live hero and not
//   the poster. Emits `reserve` (by the reserver).
// - cancel: `{op:'cancel', hero, intent}`: the poster cancels before fireTick (emits `cancel` by the
//   poster, removes the intent and expires its reservations at once, `expire` by each reserver in
//   ascending hero id); a reserver cancels its own reservation at any time before it resolves (emits
//   `cancel` by the reserver). Anything else is a logged no-op.
// - An intent whose poster cast went through, or failed, lingers while reservations remain and is
//   removed when the last one resolves. Only a pending intent counts as the poster's one live post,
//   so a poster may post again once its intent fired or expired.
// - Ops within one tick resolve in ascending intent id; for each intent the poster's fire/expire
//   comes first, then due reservations (fireTick + offset <= tick) in ascending reserver hero id.
//   Commands (post/reserve/cancel) are applied before the intents phase, so a command applied at
//   fireTick - 1 is the last one accepted, and a post with fireIn 1 fires on the next tick.
// - Cast success is observed from `ability` events (ctx.cast), so kit files stay untouched.
// A field added to these types MUST be added to `hashIntents` (L-53OTZPIIVO2XYNNL).

import type { IntentCommand } from '../sim/commands.ts';
import type { TickContext } from '../sim/context.ts';
import type { StateHasher } from '../sim/hash.ts';
import { ticks } from '../sim/time.ts';

/** An armed follow-up on someone else's intent. */
interface Reservation {
  /** The reserving hero's entity id. */
  readonly hero: number;
  readonly slot: number;
  /** Ticks after the intent's fire tick at which the reserver casts. */
  readonly offset: number;
}

interface Intent {
  /** Monotonic from 1, never reused. */
  readonly id: number;
  /** The poster's hero entity id. */
  readonly by: number;
  readonly slot: number;
  readonly intentKind: string;
  readonly x: number;
  readonly y: number;
  readonly fireTick: number;
  /** True once the poster's cast went through (the intent lingers for its reservations). */
  fired: boolean;
  /** Ascending by reserver hero id. */
  reservations: Reservation[];
}

export interface IntentBoard {
  /** The id the next post gets. */
  nextId: number;
  /** Live intents, ascending by id. */
  live: Intent[];
}

type IntentOp = 'post' | 'reserve' | 'fire' | 'fulfil' | 'expire' | 'cancel';

export function createIntentBoard(): IntentBoard {
  return { nextId: 1, live: [] };
}

/** True once any intent has ever been posted. */
export function boardUsed(board: IntentBoard): boolean {
  return board.nextId !== 1;
}

/** Every field of the board, in fixed order. */
export function hashIntents(h: StateHasher, board: IntentBoard): void {
  h.u32(board.nextId).u32(board.live.length);
  for (const i of board.live) {
    h.u32(i.id).u32(i.by).u32(i.slot).str(i.intentKind).f64(i.x).f64(i.y).f64(i.fireTick).bool(i.fired);
    h.u32(i.reservations.length);
    for (const r of i.reservations) {
      h.u32(r.hero).u32(r.slot).f64(r.offset);
    }
  }
}

function liveHero(ctx: TickContext, id: number): boolean {
  const hero = ctx.entities.get(id);
  return hero?.kind === 'hero' && hero.hp > 0;
}

function emitOp(ctx: TickContext, intent: Intent, op: IntentOp, by: number): void {
  ctx.emit({ tick: ctx.tick, kind: 'intent', id: intent.id, op, by, intentKind: intent.intentKind });
}

/** Unfired and before its fire tick: the poster's one live post. */
function pending(ctx: TickContext, intent: Intent): boolean {
  return !intent.fired && ctx.tick < intent.fireTick;
}

function post(ctx: TickContext, cmd: Extract<IntentCommand, { op: 'post' }>): void {
  const board = ctx.intents;
  if (!liveHero(ctx, cmd.hero) || board.live.length >= ctx.game.intents.maxLive) {
    return;
  }
  if (board.live.some((i) => i.by === cmd.hero && pending(ctx, i))) {
    return;
  }
  const intent: Intent = {
    id: board.nextId,
    by: cmd.hero,
    slot: cmd.slot,
    intentKind: cmd.intentKind,
    x: cmd.x,
    y: cmd.y,
    fireTick: ctx.tick + cmd.fireIn,
    fired: false,
    reservations: [],
  };
  board.nextId += 1;
  board.live.push(intent);
  emitOp(ctx, intent, 'post', intent.by);
}

function reserve(ctx: TickContext, cmd: Extract<IntentCommand, { op: 'reserve' }>): void {
  const intent = ctx.intents.live.find((i) => i.id === cmd.intent);
  if (
    intent === undefined ||
    !pending(ctx, intent) ||
    intent.by === cmd.hero ||
    !liveHero(ctx, cmd.hero) ||
    cmd.offset > ticks(ctx.game.intents.maxOffsetSeconds) ||
    intent.reservations.some((r) => r.hero === cmd.hero)
  ) {
    return;
  }
  intent.reservations.push({ hero: cmd.hero, slot: cmd.slot, offset: cmd.offset });
  intent.reservations.sort((a, b) => a.hero - b.hero);
  emitOp(ctx, intent, 'reserve', cmd.hero);
}

function cancel(ctx: TickContext, cmd: Extract<IntentCommand, { op: 'cancel' }>): void {
  const board = ctx.intents;
  const intent = board.live.find((i) => i.id === cmd.intent);
  if (intent === undefined) {
    return;
  }
  if (intent.by === cmd.hero) {
    if (!pending(ctx, intent)) {
      return;
    }
    emitOp(ctx, intent, 'cancel', intent.by);
    for (const r of intent.reservations) {
      emitOp(ctx, intent, 'expire', r.hero);
    }
    board.live = board.live.filter((i) => i.id !== intent.id);
    return;
  }
  if (!intent.reservations.some((r) => r.hero === cmd.hero)) {
    return;
  }
  intent.reservations = intent.reservations.filter((r) => r.hero !== cmd.hero);
  emitOp(ctx, intent, 'cancel', cmd.hero);
  if (intent.reservations.length === 0 && !pending(ctx, intent)) {
    board.live = board.live.filter((i) => i.id !== intent.id);
  }
}

/**
 * A hero went down: its pending post is cancelled (`cancel` by it, `expire` for each reservation on
 * it) and its own reservations are withdrawn (`cancel` by it). A fired intent it posted stays for
 * the other reservers. Ascending intent id, like every board phase.
 */
export function dropHeroIntents(ctx: TickContext, hero: number): void {
  const board = ctx.intents;
  const keep: Intent[] = [];
  for (const intent of board.live) {
    if (intent.by === hero && pending(ctx, intent)) {
      emitOp(ctx, intent, 'cancel', hero);
      for (const r of intent.reservations) {
        emitOp(ctx, intent, 'expire', r.hero);
      }
      continue;
    }
    if (intent.reservations.some((r) => r.hero === hero)) {
      intent.reservations = intent.reservations.filter((r) => r.hero !== hero);
      emitOp(ctx, intent, 'cancel', hero);
      if (intent.reservations.length === 0 && !pending(ctx, intent)) {
        continue;
      }
    }
    keep.push(intent);
  }
  board.live = keep;
}

/** Applies an `intent` command (called from commands.ts). Bad references are logged no-ops. */
export function applyIntentCommand(ctx: TickContext, cmd: IntentCommand): void {
  switch (cmd.op) {
    case 'post':
      post(ctx, cmd);
      return;
    case 'cancel':
      cancel(ctx, cmd);
      return;
    case 'reserve':
      reserve(ctx, cmd);
      return;
    default: {
      const unknown: never = cmd;
      throw new Error(`unhandled intent op ${JSON.stringify(unknown)}`);
    }
  }
}

function resolveReservations(ctx: TickContext, intent: Intent): void {
  const rest: Reservation[] = [];
  for (const r of intent.reservations) {
    if (ctx.tick < intent.fireTick + r.offset) {
      rest.push(r);
    } else {
      const ok = intent.fired && ctx.cast(r.hero, r.slot, intent);
      emitOp(ctx, intent, ok ? 'fulfil' : 'expire', r.hero);
    }
  }
  intent.reservations = rest;
}

/** The intents phase, right after commands: fires due intents and resolves reservations. */
export function intentSystem(ctx: TickContext): void {
  const board = ctx.intents;
  const keep: Intent[] = [];
  for (const intent of board.live) {
    if (!intent.fired && ctx.tick === intent.fireTick) {
      const ok = ctx.cast(intent.by, intent.slot, intent);
      emitOp(ctx, intent, ok ? 'fire' : 'expire', intent.by);
      intent.fired = ok;
    }
    resolveReservations(ctx, intent);
    if (intent.reservations.length > 0 || pending(ctx, intent)) {
      keep.push(intent);
    }
  }
  board.live = keep;
}
