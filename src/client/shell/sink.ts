// The local command sink. Owner: w7-shell.
// The contracts slice ships the working version (it is three lines); w7-shell owns the test.

import type { Match } from '../../match/match.ts';
import type { Command } from '../../sim/commands.ts';
import type { CommandSink } from './types.ts';

/** Submits `cmd` for `player` to apply `delayTicks` after the match's current tick. */
export function localSink(match: Match, delayTicks: number): CommandSink {
  return {
    submit(player: number, cmd: Command): void {
      match.sim.command(player, cmd, match.tick + delayTicks);
    },
  };
}
