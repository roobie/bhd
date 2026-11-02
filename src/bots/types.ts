// Bot shapes (wave w2-bots DESIGN "Utility framework and doctrines"). Owner: contracts (fixed
// here). Bots are pure functions of (perception, own memory, doctrine, own delay): they return
// decisions, `Match` scores them (utility.ts `decide`), schedules the picked option's commands
// after the seat's reaction delay and emits `choice` events. A bot never touches the sim.

import type { Doctrine } from '../content/bots.ts';
import type { Point } from '../content/types.ts';
import type { HeroView, Perception } from '../perception/types.ts';
import type { Command } from '../sim/commands.ts';

/** One thing a bot could do. `commands` are submitted when it wins (empty = do nothing). */
export interface Option {
  /** Stable within its decision; stickiness and emit-on-change track it. */
  readonly id: string;
  /**
   * What `choice` events call this option (default `id`). Options may share a label, e.g. one per
   * target with the label `mark`, so the log holds a stable category, not an entity id.
   */
  readonly label?: string;
  /** Benefit, higher is better. */
  readonly value: number;
  /** Price, subtracted from value. */
  readonly cost: number;
  readonly commands: readonly Command[];
  /** Submit the commands as this player instead of the seat's own (bargain accepts: the card hero's slot). */
  readonly player?: number;
}

/**
 * A choice among options, listed in a fixed order (ties go to the first). `id` is stable across
 * thinks (`<kit>.<name>`, e.g. `gunner.stance`) so stickiness and emit-on-change can track it.
 * Decisions with a single option are not scored events; they just run.
 */
export interface Decision {
  readonly id: string;
  /** Hero entity the `choice` event names; absent = the seat's own hero (bargain offers name the benefiting hero). */
  readonly hero?: number;
  readonly options: readonly Option[];
}

/** What a brain is told once about its seat. */
export interface SeatInfo {
  readonly slot: number;
  /** Hero entity id. */
  readonly hero: number;
  readonly kit: 'gunner' | 'penitent' | 'psyker' | 'standin';
  /** Where the seat holds by default (`map.heroSpawns[slot]`); the leash is measured from it. */
  readonly post: Point;
}

/** A command the seat has submitted that the sim has not applied yet (applies at tick `at`). */
export interface InFlight {
  readonly cmd: Command;
  readonly at: number;
}

export interface BotCtx {
  readonly p: Perception;
  readonly me: HeroView;
  readonly doctrine: Doctrine;
  /** Kit weights with the doctrine's overrides applied; read through `weight()`. */
  readonly weights: Readonly<Record<string, number>>;
  /** The seat's reaction delay in ticks: a command it submits now applies this many ticks later. */
  readonly delay: number;
  /** The tick whose state `p` describes. */
  readonly tick: number;
  /** The seat's own commands submitted but not yet applied (copies), oldest first. */
  readonly inFlight: readonly InFlight[];
}

/** Per-kit logic with private memory `M`. */
export interface Brain<M> {
  init: (seat: SeatInfo) => M;
  think: (ctx: BotCtx, memory: M) => Decision[];
}

/** A brain bound to its memory; one per seat. */
export interface Bot {
  think: (ctx: BotCtx) => Decision[];
}

/** Makes a seat's bot; the default table dispatches on `def.kit`. Tests inject their own. */
type BotFactory = (seat: SeatInfo) => Bot;

export interface BrainTable {
  readonly gunner: BotFactory;
  readonly penitent: BotFactory;
  readonly psyker: BotFactory;
  readonly standin: BotFactory;
}
