// Builds the all-bot Match a viewer config describes, through match/run.ts (the reporter builds
// its Matches the same way). The spec <-> config mapping lives here: match/ must not see the client.

import type { Match } from '../match/match.ts';
import type { GameSpec } from '../match/run.ts';
import { buildMatch as buildSpecMatch, DEFAULT_HASH_EVERY, DEFAULT_MAX_TICKS, RUN_ABI } from '../match/run.ts';
import type { ViewerConfig } from './config.ts';

/** The spec of a viewer config; what the viewer does not choose takes the run defaults. */
export function specFromConfig(c: ViewerConfig): GameSpec {
  return {
    abi: RUN_ABI,
    seed: c.seed,
    mode: c.mode,
    doctrines: c.doctrines,
    reactionSeconds: c.reactionSeconds,
    thinkSeconds: c.thinkSeconds,
    maxTicks: DEFAULT_MAX_TICKS,
    hashEvery: DEFAULT_HASH_EVERY,
  };
}

/** The viewer config of a spec (overrides, maxTicks and hashEvery are not viewer settings). */
export function configFromSpec(s: GameSpec): ViewerConfig {
  return {
    seed: s.seed,
    mode: s.mode,
    doctrines: s.doctrines,
    reactionSeconds: s.reactionSeconds,
    thinkSeconds: s.thinkSeconds,
  };
}

export function buildMatch(c: ViewerConfig): Match {
  return buildSpecMatch(specFromConfig(c));
}
