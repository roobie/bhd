// Brain plumbing (wave w2-bots DESIGN). Owner: contracts. `createBot` binds a brain to its memory;
// `defaultBrains` dispatches on the hero's kit. A brain slice edits only its own brain file.

import { gunnerBrain } from './gunner.ts';
import { penitentBrain } from './penitent.ts';
import { psykerBrain } from './psyker.ts';
import { standinBrain } from './standins.ts';
import type { Bot, Brain, BrainTable, SeatInfo } from './types.ts';

export function createBot<M>(brain: Brain<M>, seat: SeatInfo): Bot {
  const memory = brain.init(seat);
  return { think: (ctx) => brain.think(ctx, memory) };
}

export function defaultBrains(): BrainTable {
  return {
    gunner: (seat) => createBot(gunnerBrain, seat),
    penitent: (seat) => createBot(penitentBrain, seat),
    psyker: (seat) => createBot(psykerBrain, seat),
    standin: (seat) => createBot(standinBrain, seat),
  };
}
