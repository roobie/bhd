// STUB (wave 10 step 1): lockstep core. Slice C replaces the bodies; the signatures are the contract.
// Pure: the clock is injected, nothing reads wall time. Both ends are `TickDriver`s (shell/types.ts)
// and follow rule R1: only `beforeStep(T)` calls `sim.command` for human and system players.

import type { TickDriver } from '../client/shell/types.ts';
import type { Match } from '../match/match.ts';
import type { PeerId, Transport } from './types.ts';

export interface LockstepOptions {
  readonly match: Match;
  readonly transport: Transport;
  /** Input delay in ticks (the `start` message's `delay`). */
  readonly delay: number;
  /** Players (hero slots) this peer submits as. */
  readonly players: readonly number[];
  /** Milliseconds clock, injected. */
  readonly now: () => number;
}

export interface HostOptions extends LockstepOptions {
  /** Which peer may submit as which players; inputs from anyone else are dropped. */
  readonly seats: ReadonlyMap<PeerId, readonly number[]>;
}

/** The host: seals ticks, compares hashes, issues control commands as `SYSTEM_PLAYER`. */
export function createHostDriver(_options: HostOptions): TickDriver {
  throw new Error('createHostDriver: not implemented (wave 10 slice C)');
}

/** A client: sends inputs to the host, steps only sealed ticks. */
export function createClientDriver(_options: LockstepOptions): TickDriver {
  throw new Error('createClientDriver: not implemented (wave 10 slice C)');
}
