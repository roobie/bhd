import type { GameConfig } from '../content/index.ts';
import type { Rng } from '../detmath/index.ts';
import type { EntityStore } from './entities.ts';
import type { EndReason, SimEvent } from './events.ts';
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
