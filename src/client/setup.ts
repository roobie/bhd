// Builds the all-bot Match a viewer config describes.

import type { BotSetup } from '../content/bots.ts';
import { defaultBotSetup } from '../content/bots.ts';
import { defaultDirector } from '../content/director.ts';
import { defaultGame, defaultMasterGame } from '../content/index.ts';
import { Match } from '../match/match.ts';
import type { ViewerConfig } from './config.ts';

function botsFor(c: ViewerConfig): BotSetup {
  const base = defaultBotSetup();
  return {
    ...base,
    thinkSeconds: c.thinkSeconds,
    seats: base.seats.map((s) => ({
      ...s,
      doctrine: c.doctrines[s.slot] ?? s.doctrine,
      reactionSeconds: c.reactionSeconds,
    })),
  };
}

export function buildMatch(c: ViewerConfig): Match {
  const director = c.mode === 'director';
  return new Match({
    seed: c.seed,
    game: director ? defaultMasterGame() : defaultGame(),
    bots: botsFor(c),
    ...(director ? { director: defaultDirector() } : {}),
  });
}
