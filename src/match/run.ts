// The one way to turn a game description into a Match and to run it to the end. The viewer
// (client/setup.ts) and the reporter both build through here, so a logged game opens in the viewer
// exactly as it ran. Pure: seed + spec + code determine the events.
//
// RUN_ABI is the code ABI of this file: a ref snapshot must export `RUN_ABI` and `runGame` with the
// shapes below for the reporter to run it. Bump it when GameSpec or runGame's result change meaning.

import type { BotSetup } from '../content/bots.ts';
import { defaultBotSetup } from '../content/bots.ts';
import { defaultDirector } from '../content/director.ts';
import { defaultGame, defaultMasterGame } from '../content/index.ts';
import type { ConfigOverrides, RunConfig } from '../content/overrides.ts';
import { applyOverrides } from '../content/overrides.ts';
import type { EndReason, SimEvent } from '../sim/events.ts';
import { Match } from './match.ts';

export const RUN_ABI = 1;

/** Ticks a game runs at most when the caller does not say (the longest shipped games take ~10,000). */
export const DEFAULT_MAX_TICKS = 30_000;
/** Ticks between `hash` events by default (the Sim's own default). */
export const DEFAULT_HASH_EVERY = 30;

export type Mode = 'director' | 'schedule';

const SEATS = 4;

/** Everything that determines one game (all-bot unless `humans` is set), as plain JSON. */
export interface GameSpec {
  /** Must equal `RUN_ABI` of the code that runs it. */
  readonly abi: number;
  readonly seed: number;
  /** `director`: the wave master seat buys the waves; `schedule`: the fixed wave table. */
  readonly mode: Mode;
  /** Doctrine id per hero slot 0-3. */
  readonly doctrines: readonly string[];
  readonly reactionSeconds: number;
  readonly thinkSeconds: number;
  /** The game stops here if it has not ended. */
  readonly maxTicks: number;
  /** Ticks between `hash` events. */
  readonly hashEvery: number;
  /**
   * Hero slots (unique, 0-3) a human drives through `sim.command` (their bot seats stay silent until
   * `Match.setDriven` hands them back). Absent or empty means an all-bot game. The reporter never sets it.
   */
  readonly humans?: readonly number[];
  /** A patch on the shipped config; see content/overrides.ts. */
  readonly overrides?: ConfigOverrides;
}

/** How a game ended; `maxTicks` means it was cut off. */
export interface GameEnd {
  readonly tick: number;
  /** Number of waves started. */
  readonly wave: number;
  readonly reason: EndReason | 'maxTicks';
}

export interface GameResult {
  /** Every event in emission order, `choice` and `hash` included. */
  readonly events: SimEvent[];
  /** The config the game ran with, after overrides. */
  readonly resolved: RunConfig;
  readonly end: GameEnd;
  /** Ticks stepped. */
  readonly ticks: number;
}

function botsFor(spec: GameSpec): BotSetup {
  const base = defaultBotSetup();
  return {
    ...base,
    thinkSeconds: spec.thinkSeconds,
    // Every slot keeps its seat: a human's seat stays silent (`Match.driven`) and a bot takes the hero back on `setDriven`.
    seats: base.seats.map((s) => ({
      ...s,
      doctrine: spec.doctrines[s.slot] ?? s.doctrine,
      reactionSeconds: spec.reactionSeconds,
    })),
  };
}

function checkSpec(spec: GameSpec): void {
  if (spec.abi !== RUN_ABI) {
    throw new RangeError(`GameSpec abi ${spec.abi} does not match RUN_ABI ${RUN_ABI}`);
  }
  if (spec.doctrines.length !== SEATS) {
    throw new RangeError(`GameSpec needs ${SEATS} doctrines, got ${spec.doctrines.length}`);
  }
  if (!(Number.isSafeInteger(spec.maxTicks) && spec.maxTicks > 0)) {
    throw new RangeError(`GameSpec maxTicks must be a positive integer, got ${spec.maxTicks}`);
  }
  const seen = new Set<number>();
  for (const slot of spec.humans ?? []) {
    if (!(Number.isInteger(slot) && slot >= 0 && slot < SEATS) || seen.has(slot)) {
      throw new RangeError(`GameSpec humans must be unique slots 0-${SEATS - 1}, got ${slot}`);
    }
    seen.add(slot);
  }
}

/** The config a spec runs with: shipped defaults for its mode, the spec's seats, then overrides. */
function resolveSpec(spec: GameSpec): RunConfig {
  checkSpec(spec);
  const director = spec.mode === 'director';
  return applyOverrides(
    {
      game: director ? defaultMasterGame() : defaultGame(),
      bots: botsFor(spec),
      ...(director ? { director: defaultDirector() } : {}),
    },
    spec.overrides,
  );
}

function matchOf(spec: GameSpec, resolved: RunConfig): Match {
  return new Match({
    seed: spec.seed,
    game: resolved.game,
    bots: resolved.bots,
    hashEvery: spec.hashEvery,
    ...(spec.humans === undefined ? {} : { driven: spec.humans }),
    ...(resolved.director === undefined ? {} : { director: resolved.director }),
  });
}

/** The Match a spec describes, at tick 0: all bots, except the seats of `humans`. */
export function buildMatch(spec: GameSpec): Match {
  return matchOf(spec, resolveSpec(spec));
}

/** Runs the game until it ends or `maxTicks`. */
export function runGame(spec: GameSpec): GameResult {
  const resolved = resolveSpec(spec);
  const match = matchOf(spec, resolved);
  const events: SimEvent[] = [];
  let end: GameEnd | undefined;
  while (end === undefined && match.tick < spec.maxTicks) {
    for (const e of match.step()) {
      events.push(e);
      if (e.kind === 'end') {
        end = { tick: e.tick, wave: e.wave, reason: e.reason };
      }
    }
  }
  return {
    events,
    resolved,
    end: end ?? { tick: match.tick, wave: match.sim.waves.n, reason: 'maxTicks' },
    ticks: match.tick,
  };
}
