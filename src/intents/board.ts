// Intents board (project DESIGN.md §6.3; wave w2-bots DESIGN "Intents board lives in the sim").
// STUB: contracts fixed the state shape, the three entry points and the hash; the intents slice
// fills in the rest. Owner: intents.
//
// A human's armed trigger and a bot intent are the same object and fire on the lockstep tick, so
// the board is sim state (hashed) and its phase runs right after commands: `intentSystem`.
//
// Contract (the full spec, of which this stub implements post, fire and the poster's cancel):
// - post: `{op:'post', hero, slot, intentKind, x, y, fireIn}`; `fireTick = applyTick + fireIn`
//   (fireIn >= 1 whole ticks); one unfired posted intent per hero; at most `intents.maxLive` live.
//   Emits `intent post`. Refused (logged `cmd` only) for a missing or dead hero.
// - At `fireTick` the sim casts the poster's `slot` at (x, y) with `ctx.cast`: success -> `fire`,
//   failure (dead, cooldown, locked) -> `expire`, intent removed.
// - reserve: `{op:'reserve', hero, intent, slot, offset}`: an armed follow-up; at `fireTick + offset`
//   the sim casts the reserver's slot at the intent point: success -> `fulfil` (by reserver),
//   failure or the intent never fired -> `expire` (by reserver). Accepted only before fireTick, one
//   per hero per intent, `offset` whole ticks <= ticks(intents.maxOffsetSeconds). No ability lock:
//   casting it early just makes the reservation expire. (STUB: accepted commands are no-ops.)
// - cancel: `{op:'cancel', hero, intent}`: the poster cancels before fireTick; a reserver cancels
//   its own reservation. The intent is removed after its last reservation resolves.
// - Ops within one tick resolve in ascending intent id, then reservations in ascending hero id.
// - Cast success is observed from `ability` events (ctx.cast), so kit files stay untouched.
// A field added to these types MUST be added to `hashIntents` (L-53OTZPIIVO2XYNNL).

import type { IntentCommand } from '../sim/commands.ts';
import type { TickContext } from '../sim/context.ts';
import type { StateHasher } from '../sim/hash.ts';

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

export function createIntentBoard(): IntentBoard {
  return { nextId: 1, live: [] };
}

/** True once any intent has ever been posted; the hash covers the board only from then on. */
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

function post(ctx: TickContext, cmd: Extract<IntentCommand, { op: 'post' }>): void {
  const board = ctx.intents;
  const hero = ctx.entities.get(cmd.hero);
  if (hero?.kind !== 'hero' || hero.hp <= 0 || board.live.length >= ctx.game.intents.maxLive) {
    return;
  }
  if (board.live.some((i) => i.by === cmd.hero && !i.fired)) {
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
  ctx.emit({ tick: ctx.tick, kind: 'intent', id: intent.id, op: 'post', by: intent.by, intentKind: intent.intentKind });
}

function cancel(ctx: TickContext, cmd: Extract<IntentCommand, { op: 'cancel' }>): void {
  const board = ctx.intents;
  const intent = board.live.find((i) => i.id === cmd.intent);
  if (intent === undefined || intent.by !== cmd.hero || intent.fired) {
    return;
  }
  board.live = board.live.filter((i) => i.id !== intent.id);
  ctx.emit({
    tick: ctx.tick,
    kind: 'intent',
    id: intent.id,
    op: 'cancel',
    by: intent.by,
    intentKind: intent.intentKind,
  });
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
      // TODO(intents slice): see the contract above.
      return;
    default: {
      const unknown: never = cmd;
      throw new Error(`unhandled intent op ${JSON.stringify(unknown)}`);
    }
  }
}

/** The intents phase, right after commands: fires due intents and resolves reservations. */
export function intentSystem(ctx: TickContext): void {
  const board = ctx.intents;
  if (board.live.length === 0) {
    return;
  }
  const keep: Intent[] = [];
  for (const intent of board.live) {
    if (!intent.fired && ctx.tick >= intent.fireTick) {
      const ok = ctx.cast(intent.by, intent.slot, intent);
      const op = ok ? 'fire' : 'expire';
      ctx.emit({ tick: ctx.tick, kind: 'intent', id: intent.id, op, by: intent.by, intentKind: intent.intentKind });
      intent.fired = ok;
    }
    // TODO(intents slice): resolve reservations here.
    if (intent.fired && intent.reservations.length > 0) {
      keep.push(intent);
    } else if (!intent.fired && ctx.tick < intent.fireTick) {
      keep.push(intent);
    }
  }
  board.live = keep;
}
