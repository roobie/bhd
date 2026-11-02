// Perception of bargains (wave 9): open offers and accepted bargains as plain copied data. STEP-1
// STUBS: they return empty views until slice A (sim engine) fills them in from `sim.bargains`.
// Bots read offers here and nowhere else (D-ABIU2YALDBBGMWAR).

import type { Sim } from '../sim/sim.ts';
import type { Perception } from './types.ts';

/** STUB (slice A): `Perception.bargains`: open offers (ascending by id, effects as `EffectView`s) and accepted bargains in acceptance order. */
export function perceiveBargains(_sim: Sim): Perception['bargains'] {
  return { open: [], taken: [] };
}

/** STUB (slice A): ids of the accepted bargains that apply to hero entity `hero` (its own and the team's), acceptance order. */
export function heroBargains(_sim: Sim, _hero: number): readonly string[] {
  return [];
}
