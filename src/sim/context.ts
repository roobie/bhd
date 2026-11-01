import type { Rng } from '../detmath/index.ts';
import type { EntityStore } from './entities.ts';
import type { SimEvent } from './events.ts';

/** What a system or command handler may touch during one tick. */
export interface TickContext {
  readonly tick: number;
  readonly entities: EntityStore;
  /** The sim's own stream; bots and the director use their own (DESIGN.md §6.1). */
  readonly rng: Rng;
  readonly emit: (event: SimEvent) => void;
}
