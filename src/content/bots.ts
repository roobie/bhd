// Bot doctrines and seat setup (project DESIGN.md §6.2). Data passed to `Match` so the reporter
// can compare two setups. Owner: contracts (shapes), gunner-bot / standin-bots (their weights live
// in content/bots/*.ts). Authored in seconds and world units.

import { gunnerWeights } from './bots/gunner.ts';
import { standinWeights } from './bots/standins.ts';

type UltimatePolicy = 'free' | 'spike' | 'combo';

/** A named set of dials shared by every hero bot that picks it. */
export interface Doctrine {
  readonly id: string;
  /** 0..1: willingness to push toward enemies (attack-move) rather than hold at the post. */
  readonly aggression: number;
  /** 0..1: tolerance for cost terms such as overheat or standing in a line. */
  readonly risk: number;
  /** Most the hero strays from its post, world units. */
  readonly leash: number;
  readonly ultimate: UltimatePolicy;
  /** Score noise: each option gets `noise * nextFloat(botRng)` added. 0 = none, no RNG draw. */
  readonly noise: number;
  /** Bonus added to the previous pick's score (anti-flapping). */
  readonly stickiness: number;
  /** Overrides for kit weights by key, e.g. `gunner.redline.allyInLine`. */
  readonly weights?: Readonly<Record<string, number>>;
}

/** One bot seat: hero slot 0-3 (lineup index), the doctrine id it plays, and its reaction delay. */
interface Seat {
  readonly slot: number;
  readonly doctrine: string;
  readonly reactionSeconds: number;
}

export interface BotSetup {
  /** Think cadence for all seats; a seat thinks on ticks divisible by `ticks(thinkSeconds)`. */
  readonly thinkSeconds: number;
  readonly seats: readonly Seat[];
  readonly doctrines: readonly Doctrine[];
  /** Base weights, keys as in content/bots/*.ts; a doctrine's `weights` override per key. */
  readonly kitWeights: Readonly<Record<string, number>>;
}

function holdTheLine(): Doctrine {
  return {
    id: 'hold-the-line',
    aggression: 0.2,
    risk: 0.3,
    leash: 6,
    ultimate: 'spike',
    noise: 0.05,
    stickiness: 0.2,
  };
}

export function greedy(): Doctrine {
  return {
    id: 'greedy',
    aggression: 0.8,
    risk: 0.7,
    leash: 14,
    ultimate: 'free',
    noise: 0.05,
    stickiness: 0.2,
  };
}

/** Four seats on "hold-the-line", 0.4 s reaction, thinking twice a second. */
export function defaultBotSetup(): BotSetup {
  return {
    thinkSeconds: 0.5,
    seats: [0, 1, 2, 3].map((slot) => ({ slot, doctrine: 'hold-the-line', reactionSeconds: 0.4 })),
    doctrines: [holdTheLine(), greedy()],
    kitWeights: { ...gunnerWeights(), ...standinWeights() },
  };
}
