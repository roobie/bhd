// Perception of bargains (wave 9): open offers and accepted bargains as plain copied data, read from
// `sim.bargains` and the content pool. Bots read offers here and nowhere else (D-ABIU2YALDBBGMWAR).

import type { Effect } from '../content/bargains.ts';
import { bargainOf, bargainsReaching } from '../sim/bargains.ts';
import type { Sim } from '../sim/sim.ts';
import type { CardView, EffectView, Perception, TakenView } from './types.ts';

/** One effect as flat plain data; fields that do not apply to the kind are ''. */
function effectView(e: Effect): EffectView {
  switch (e.kind) {
    case 'def':
      return { kind: e.kind, target: e.target, value: e.value, path: e.path, op: e.op, def: e.enemy ?? '' };
    case 'waveExtra':
      return { kind: e.kind, target: e.target, value: e.count, path: '', op: '', def: e.def };
    default:
      return { kind: e.kind, target: e.target, value: e.value, path: '', op: '', def: '' };
  }
}

function effectViews(effects: readonly Effect[] | undefined): EffectView[] {
  return (effects ?? []).map(effectView);
}

function cardView(sim: Sim, bargain: string, hero: number): CardView {
  const def = bargainOf(sim.game, bargain);
  return {
    bargain,
    scope: def?.scope ?? 'team',
    hero,
    gains: effectViews(def?.gains),
    costs: effectViews(def?.costs),
  };
}

function takenView(sim: Sim, t: { bargain: string; offer: number; hero: number; tick: number }): TakenView {
  const def = bargainOf(sim.game, t.bargain);
  return {
    bargain: t.bargain,
    offer: t.offer,
    hero: t.hero,
    tick: t.tick,
    gains: effectViews(def?.gains),
    costs: effectViews(def?.costs),
  };
}

/** `Perception.bargains`: open offers (ascending by id, effects as `EffectView`s) and accepted bargains in acceptance order. Empty without bargains. */
export function perceiveBargains(sim: Sim): Perception['bargains'] {
  const state = sim.bargains;
  if (state === undefined) {
    return { open: [], taken: [] };
  }
  return {
    open: state.offers.map((o) => ({
      id: o.id,
      wave: o.wave,
      expiresAt: o.expiresAt,
      ticksLeft: Math.max(0, o.expiresAt - sim.tick),
      cards: o.cards.map((c) => cardView(sim, c.bargain, c.hero)),
    })),
    taken: state.taken.map((t) => takenView(sim, t)),
  };
}

/** Ids of the accepted bargains with a hero-facing effect that reaches hero entity `hero` (its own card's, the team's, an ally's `allies` cost), acceptance order. */
export function heroBargains(sim: Sim, hero: number): readonly string[] {
  return bargainsReaching(sim, hero);
}
