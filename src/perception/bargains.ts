// Perception of bargains (wave 9): open offers and accepted bargains as plain copied data, read from
// `sim.bargains` and the content pool. Bots read offers here and nowhere else (D-ABIU2YALDBBGMWAR).

import type { Effect } from '../content/bargains.ts';
import { defNumberAt } from '../content/bargains.ts';
import { findById } from '../content/types.ts';
import { bargainOf, bargainsReaching } from '../sim/bargains.ts';
import type { Sim } from '../sim/sim.ts';
import type { CardView, EffectView, Perception, TakenView } from './types.ts';

/** The unpatched hero-def number a `self` hero-def effect starts from, for the hero entity `benefit`; undefined otherwise. */
function baseOf(sim: Sim, e: Effect, benefit: number): number | undefined {
  if (e.kind !== 'def' || e.target !== 'self' || e.enemy !== undefined) {
    return undefined;
  }
  const hero = sim.entities.get(benefit);
  const def = hero === undefined ? undefined : findById(sim.game.heroes, hero.def);
  return def === undefined ? undefined : defNumberAt(def, e.path);
}

/** One effect as flat plain data; fields that do not apply to the kind are ''. */
function effectView(sim: Sim, e: Effect, benefit: number): EffectView {
  switch (e.kind) {
    case 'def':
      return {
        kind: e.kind,
        target: e.target,
        value: e.value,
        path: e.path,
        op: e.op,
        def: e.enemy ?? '',
        base: baseOf(sim, e, benefit),
      };
    case 'waveExtra':
      return { kind: e.kind, target: e.target, value: e.count, path: '', op: '', def: e.def, base: undefined };
    default:
      return { kind: e.kind, target: e.target, value: e.value, path: '', op: '', def: '', base: undefined };
  }
}

/** Whether the game uses the effect: `waveExtra` is schedule mode only, `masterBudget` master mode only (sim/bargains.ts). */
function applies(sim: Sim, e: Effect): boolean {
  if (e.kind === 'waveExtra') {
    return sim.game.master === undefined;
  }
  return e.kind !== 'masterBudget' || sim.game.master !== undefined;
}

/** The effects that apply in this game, as views. The ones that do nothing here are dropped so neither bots nor card text count them. */
function effectViews(sim: Sim, effects: readonly Effect[] | undefined, benefit: number): EffectView[] {
  return (effects ?? []).filter((e) => applies(sim, e)).map((e) => effectView(sim, e, benefit));
}

function cardView(sim: Sim, bargain: string, hero: number): CardView {
  const def = bargainOf(sim.game, bargain);
  return {
    bargain,
    scope: def?.scope ?? 'team',
    hero,
    gains: effectViews(sim, def?.gains, hero),
    costs: effectViews(sim, def?.costs, hero),
  };
}

function takenView(sim: Sim, t: { bargain: string; offer: number; hero: number; tick: number }): TakenView {
  const def = bargainOf(sim.game, t.bargain);
  return {
    bargain: t.bargain,
    offer: t.offer,
    hero: t.hero,
    tick: t.tick,
    gains: effectViews(sim, def?.gains, t.hero),
    costs: effectViews(sim, def?.costs, t.hero),
  };
}

/** `Perception.bargains`: open offers (ascending by id, effects as `EffectView`s) and accepted bargains in acceptance order. Empty without bargains. */
export function perceiveBargains(sim: Sim): Perception['bargains'] {
  const state = sim.bargains;
  if (state === undefined) {
    return { open: [], taken: [], declineAncientHeal: 0 };
  }
  return {
    declineAncientHeal: sim.game.bargains?.declineAncientHeal ?? 0,
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
