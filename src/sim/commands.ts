// Commands: the only input that changes sim state (DESIGN.md §3). Lockstep sends exactly these.
// Plain JSON data so they serialize unchanged into the event log and over the wire.

import type { TickContext } from './context.ts';
import type { EntityType } from './entities.ts';
import { ENTITY_TYPE_CODE } from './entities.ts';

/** PLACEHOLDER (wave 0, debug): spawn an entity at (x, y). */
interface SpawnCommand {
  readonly kind: 'spawn';
  readonly type: EntityType;
  readonly x: number;
  readonly y: number;
}

/** PLACEHOLDER (wave 0): walk `entity` toward (x, y) at its fixed speed. */
interface MoveCommand {
  readonly kind: 'move';
  readonly entity: number;
  readonly x: number;
  readonly y: number;
}

export type Command = SpawnCommand | MoveCommand;

/** Shape check at submission, so bad input never reaches the queue. Depends only on the command. */
export function isValidCommand(cmd: Command): boolean {
  switch (cmd.kind) {
    case 'spawn':
      return Object.hasOwn(ENTITY_TYPE_CODE, cmd.type) && Number.isFinite(cmd.x) && Number.isFinite(cmd.y);
    case 'move':
      return Number.isSafeInteger(cmd.entity) && Number.isFinite(cmd.x) && Number.isFinite(cmd.y);
    default:
      return false;
  }
}

/**
 * Own copy of `cmd` with -0 turned into 0 in every numeric field. JSON writes -0 as "0", so a
 * logged or networked command would otherwise replay as a different float than the one that ran
 * (the state hash compares exact bits). This is the one place that makes commands wire-safe.
 */
export function canonicalCommand(cmd: Command): Command {
  switch (cmd.kind) {
    case 'spawn':
      return { kind: 'spawn', type: cmd.type, x: cmd.x + 0, y: cmd.y + 0 };
    case 'move':
      return { kind: 'move', entity: cmd.entity + 0, x: cmd.x + 0, y: cmd.y + 0 };
    default: {
      const unknown: never = cmd;
      throw new Error(`unhandled command ${JSON.stringify(unknown)}`);
    }
  }
}

/** Applies one command. Commands that target missing entities are no-ops (still logged as `cmd`). */
export function applyCommand(ctx: TickContext, cmd: Command): void {
  switch (cmd.kind) {
    case 'spawn': {
      const e = ctx.entities.add(cmd.type, cmd.x, cmd.y);
      ctx.emit({ tick: ctx.tick, kind: 'spawn', id: e.id, type: e.type });
      return;
    }
    case 'move': {
      const e = ctx.entities.get(cmd.entity);
      if (e !== undefined) {
        e.tx = cmd.x;
        e.ty = cmd.y;
        e.moving = true;
      }
      return;
    }
    default: {
      const unknown: never = cmd;
      throw new Error(`unhandled command ${JSON.stringify(unknown)}`);
    }
  }
}
