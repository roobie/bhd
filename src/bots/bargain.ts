// Bot side of bargains (wave 9). STEP-1 STUB: returns no decisions until slice C (bot evaluator)
// fills it in. Bots see offers only through Perception (`ctx.p.bargains.open`, D-ABIU2YALDBBGMWAR).
//
// Contract for slice C: one `Decision` per open offer the seat may resolve, id `bargain.offer`
// (options: `decline`, and `accept:<card>` per card; commands `bargain` accept / decline). `Match`
// calls this on every think of a bot seat when `MatchOptions.bargainPolicy` is `bots`, and dedupes
// the commands on the channel `bargain:<offer>`.

import type { BargainBotPolicy } from '../content/bots.ts';
import type { BotCtx, Decision } from './types.ts';

/** STUB (slice C): the seat's bargain decisions under `policy` (`evaluate` scores cards, `declineAll`, `acceptAll`). */
export function bargainDecisions(_ctx: BotCtx, _policy: BargainBotPolicy): Decision[] {
  return [];
}
