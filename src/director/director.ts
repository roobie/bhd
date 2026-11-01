// The Director: the wave master seat (player 4). STUB (basic and working): the director slice owns
// it. Contract: `createDirector(def)` returns a Director whose `think` runs on its think ticks (from
// `Match`) and returns commands (`summon` / `send`) that Match submits after the Director's own
// reaction delay. Pure function of (perception, master view, own state, own rng). `status()` is
// read by the viewer. The Director paces for tension and never plays to win.

import type { InFlight } from '../bots/types.ts';
import type { DirectorDef } from '../content/director.ts';
import type { Rng } from '../detmath/index.ts';
import type { MasterView, Perception } from '../perception/types.ts';
import type { Command } from '../sim/commands.ts';
import type { TensionPhase } from './tension.ts';
import { createTension, updateTension } from './tension.ts';

interface DirectorCtx {
  readonly p: Perception;
  readonly master: MasterView;
  readonly def: DirectorDef;
  readonly rng: Rng;
  /** The tick whose state `p` describes. */
  readonly tick: number;
  /** The Director's own commands submitted but not yet applied (copies), oldest first. */
  readonly inFlight: readonly InFlight[];
}

export interface DirectorStatus {
  readonly tension: number;
  readonly phase: TensionPhase;
}

export interface Director {
  think: (ctx: DirectorCtx) => Command[];
  status: () => DirectorStatus;
}

function cost(master: MasterView, def: string): number {
  return master.costs.find((c) => c.def === def)?.cost ?? Number.POSITIVE_INFINITY;
}

export function createDirector(def: DirectorDef): Director {
  const tension = createTension();
  return {
    think(ctx) {
      updateTension(tension, ctx.p, def, def.thinkSeconds);
      // Buy one affordable unit, preferring the last (strongest) of the mix.
      for (let i = def.mix.length - 1; i >= 0; i--) {
        const unit = def.mix[i];
        if (unit !== undefined && cost(ctx.master, unit) <= ctx.master.budget) {
          return [{ kind: 'summon', def: unit, count: 1 }];
        }
      }
      return [];
    },
    status: () => ({ tension: tension.value, phase: tension.phase }),
  };
}
