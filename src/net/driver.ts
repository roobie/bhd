// `netDriver`: the `TickDriver` of a networked game. The shell passes it as `ShellOptions.driver`; it
// picks the host sequencer or the client driver (lockstep.ts) from who this peer is.

import type { Match } from '../match/match.ts';
import type { LockstepDriver } from './lockstep.ts';
import { createClientDriver, createHostDriver } from './lockstep.ts';
import type { PeerId, Transport, WireMsg } from './types.ts';

/** The payload of the `start` message. */
export type StartInfo = Extract<WireMsg, { t: 'start' }>;

export interface NetDriverOptions {
  readonly transport: Transport;
  /** The `start` message every peer received (spec, seats, delay). */
  readonly start: Pick<StartInfo, 'spec' | 'seats' | 'delay'>;
  /** The room's host: the sequencer. This peer is the host when it equals `transport.self`. */
  readonly host: PeerId;
  /** Milliseconds clock, injected (the shell's `now`). */
  readonly now: () => number;
  /** Ticks between hash exchanges; default 30. */
  readonly checkEvery?: number;
}

/**
 * Builds the driver for `match`, which must have been built from `options.start.spec` (`buildMatch`).
 * Usable as `ShellOptions.driver` via `(match) => netDriver(options)(match)` or, to keep the
 * `LockstepDriver` handle (pause, notices, dump), by calling the returned factory yourself.
 */
export function netDriver(options: NetDriverOptions): (match: Match) => LockstepDriver {
  return (match) => {
    const seats = new Map<PeerId, readonly number[]>(options.start.seats.map((s) => [s.peer, s.players]));
    const base = {
      match,
      transport: options.transport,
      delay: options.start.delay,
      players: seats.get(options.transport.self) ?? [],
      now: options.now,
      spec: options.start.spec,
      seats,
      ...(options.checkEvery === undefined ? {} : { checkEvery: options.checkEvery }),
    };
    return options.transport.self === options.host
      ? createHostDriver(base)
      : createClientDriver({ ...base, host: options.host });
  };
}
