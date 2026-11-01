// Gunner brain. STUB: the probe brain until the gunner-bot slice replaces it. Owner: gunner-bot.
// Contract: `gunnerBrain: Brain<M>` (types.ts); decisions per slice criteria: stance, fire/hold with
// an ally-in-line cost (`gunner.redline.allyInLine`), vent, Suppressing Fire, Furnace Heart;
// reserves against a pull intent. Reads `ctx.p.heroes[i].gunner` and `lineAllies`.

import { probeBrain } from './probe.ts';

export const gunnerBrain = probeBrain;
