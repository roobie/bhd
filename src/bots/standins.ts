// Stand-in brains (tank, ranged, support). STUB: the probe brain until the standin-bots slice
// replaces it. Owner: standin-bots. Contract: `standinBrain: Brain<M>` (types.ts), one brain for all
// three roles that dispatches on `ctx.me.role`; support posts pull intents (`intent` command),
// the tank costs standing in the Gunner's line (`standin.tank.stand.inGunnerLine`), ranged marks.

import { probeBrain } from './probe.ts';

export const standinBrain = probeBrain;
