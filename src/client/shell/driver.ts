// The local tick driver (solo play). Owner: w7-shell; the lockstep driver is src/net's.

import type { Match } from '../../match/match.ts';
import type { Command } from '../../sim/commands.ts';
import type { DriverStatus, TickDriver } from './types.ts';

/** Submits `cmd` for `player` to apply `delayTicks` after the match's current tick; never gates stepping. */
export function localDriver(match: Match, delayTicks: number): TickDriver {
  return {
    submit(player: number, cmd: Command): void {
      match.sim.command(player, cmd, match.tick + delayTicks);
    },
    steppable: () => Number.POSITIVE_INFINITY,
    beforeStep: () => undefined,
    afterStep: () => undefined,
    status: (): DriverStatus => (match.ended ? 'ended' : 'running'),
  };
}
