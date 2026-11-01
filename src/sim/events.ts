// Event stream (DESIGN.md §6.6): the source of truth for the reporter and replays.
// Every event is `{tick, kind, ...}`. Add kinds here as systems land in wave 1.

import type { Command } from './commands.ts';
import type { EntityType } from './entities.ts';

interface EventBase {
  readonly tick: number;
}

/** A command applied at the start of `tick`, exactly as submitted. */
interface CmdEvent extends EventBase {
  readonly kind: 'cmd';
  readonly player: number;
  readonly cmd: Command;
}

interface SpawnEvent extends EventBase {
  readonly kind: 'spawn';
  readonly id: number;
  readonly type: EntityType;
}

/** State hash after `tick` completed; see `Sim.hash`. */
interface HashEvent extends EventBase {
  readonly kind: 'hash';
  readonly stateHash: string;
}

export type SimEvent = CmdEvent | SpawnEvent | HashEvent;
