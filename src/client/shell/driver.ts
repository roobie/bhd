// The local tick driver (solo play). Owner: w7-shell; the lockstep driver is src/net's.

import type { Match } from '../../match/match.ts';
import type { Command } from '../../sim/commands.ts';
import type { DriverNotice, DriverStatus, TickDriver } from './types.ts';

/** Submits `cmd` for `player` to apply `delayTicks` after the match's current tick; only a pause gates stepping. */
export function localDriver(match: Match, delayTicks: number): TickDriver {
  let paused = false;
  const listeners = new Set<(n: DriverNotice) => void>();
  return {
    submit(player: number, cmd: Command): void {
      match.sim.command(player, cmd, match.tick + delayTicks);
    },
    steppable: () => (paused ? match.tick : Number.POSITIVE_INFINITY),
    beforeStep: () => undefined,
    afterStep: () => undefined,
    status: (): DriverStatus => {
      if (match.ended) {
        return 'ended';
      }
      return paused ? 'paused' : 'running';
    },
    setPaused(on: boolean, by: number): void {
      if (on === paused) {
        return;
      }
      paused = on;
      for (const cb of listeners) {
        cb({ kind: on ? 'paused' : 'resumed', by });
      }
    },
    dispose: () => listeners.clear(),
    dump: () => undefined,
    onNotice(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
