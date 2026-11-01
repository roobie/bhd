import type { GameConfig } from '../content/index.ts';
import type { Rng } from '../detmath/index.ts';
import type { IntentBoard } from '../intents/board.ts';
import type { EntityStore } from './entities.ts';
import type { EndReason, SimEvent } from './events.ts';
import type { MasterState } from './master.ts';
import type { WaveState } from './waves.ts';

/** What a system or command handler may touch during one tick. */
export interface TickContext {
  readonly tick: number;
  readonly entities: EntityStore;
  /** The sim's own stream; bots and the director use their own (project DESIGN.md §6.1). */
  readonly rng: Rng;
  readonly emit: (event: SimEvent) => void;
  /** Content for this game (read only). */
  readonly game: GameConfig;
  /** Wave scheduler state (owned by waves.ts; hashed through `hashWaves`). */
  readonly waves: WaveState;
  /** Intents board (owned by intents/board.ts; hashed through `hashIntents`). */
  readonly intents: IntentBoard;
  /** Wave master state; undefined in schedule mode (owned by master.ts; hashed through `hashMaster`). */
  readonly master: MasterState | undefined;
  /**
   * Casts `hero`'s ability `slot` (at (x, y) when given) exactly as an `ability` command would,
   * without a `cmd` event. True if the cast went through (the kit emitted an `ability` event for that
   * hero and slot). Used by the intents phase.
   */
  readonly cast: (hero: number, slot: number, at?: { readonly x: number; readonly y: number }) => boolean;
  /** Entity id of the Ancient. */
  readonly ancientId: number;
  /**
   * Victim id -> id of whoever took it to 0 hp this tick. Transient (cleared every tick, not
   * hashed): `dealDamage` records it, the deaths system reads it for the `death` event.
   */
  readonly killers: Map<number, number>;
  /** Ends the game: emits `end` once and stops gameplay (see Sim). */
  readonly end: (reason: EndReason) => void;
}
