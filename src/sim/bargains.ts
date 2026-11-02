// Bargains in the sim (wave 9, PLAN.md). STEP-1 STUBS: shapes and hook points are fixed here, every
// behaviour is an identity or a no-op until slice A (sim engine) fills them in. With
// `GameConfig.bargains` unset nothing here runs and `Sim.bargains` is undefined.
//
// Hooks (positions fixed, see .work/wave/U-IUFI7QQSGH4543TP-w9-bargains/CONTRACT.md):
// - `ctx.mods` (`createMods`): damage dealt / taken, heals received and respawn timer multipliers,
//   a modifier layer rebuilt from the hashed `taken` list, never hashed itself;
// - `heroDef`: the hero's effective def (base def with `def` patches applied), used by `runKit` and perception;
// - `bargainExtras` (startWave), `wavesPaused` (waveSystem), `grantBudget` (master takePending);
// - `bargainSystem` runs right after waveSystem; `applyBargainCommand` handles the `bargain` command.
// Invariant for slice A: the Ancient's hp goes down only through `leak` damage; `healAncient`
// (combat.ts) is the only way a bargain touches it. A field added to `BargainState` MUST be added to
// `hashBargains` (L-53OTZPIIVO2XYNNL).

import type { GameConfig, HeroDef } from '../content/index.ts';
import { findById } from '../content/types.ts';
import type { Rng } from '../detmath/index.ts';
import { deriveRng } from '../detmath/index.ts';
import type { BargainCommand } from './commands.ts';
import type { Mods, TickContext } from './context.ts';
import type { Entity } from './entities.ts';
import type { StateHasher } from './hash.ts';

/** One card of an open offer. */
export interface OfferCard {
  /** `BargainDef.id`. */
  readonly bargain: string;
  /** Entity id of the hero the card benefits; 0 for a team card. */
  readonly hero: number;
}

/** An open offer: resolved by the first valid `bargain` command, or lapsing at `expiresAt` (a decline). */
export interface Offer {
  readonly id: number;
  /** The wave whose end opened it. */
  readonly wave: number;
  /** First tick the offer is no longer open. */
  readonly expiresAt: number;
  readonly cards: readonly OfferCard[];
}

/** An accepted bargain. The list of these is the whole truth; the modifier layer is derived from it. */
export interface TakenBargain {
  readonly bargain: string;
  readonly offer: number;
  /** Entity id of the benefiting hero, 0 for a team card. */
  readonly hero: number;
  /** Tick it was accepted. */
  readonly tick: number;
}

export interface BargainState {
  /** Own stream `deriveRng(seed, 'bargains')`; the card draw uses it and nothing else does. */
  readonly rng: Rng;
  /** Id of the next offer to open (1-based). */
  nextOffer: number;
  /** How many entries of `bargains.afterWaves` have opened an offer. */
  opened: number;
  /** Open offers, ascending by id. */
  offers: Offer[];
  /** Accepted bargains in acceptance order. */
  taken: TakenBargain[];
}

export function createBargainState(seed: number): BargainState {
  return { rng: deriveRng(seed, 'bargains'), nextOffer: 1, opened: 0, offers: [], taken: [] };
}

/** Every field of the state, in fixed order. */
export function hashBargains(h: StateHasher, b: BargainState): void {
  for (const w of b.rng.state) {
    h.u32(w);
  }
  h.u32(b.nextOffer).u32(b.opened).u32(b.offers.length);
  for (const o of b.offers) {
    h.u32(o.id).u32(o.wave).f64(o.expiresAt).u32(o.cards.length);
    for (const c of o.cards) {
      h.str(c.bargain).u32(c.hero);
    }
  }
  h.u32(b.taken.length);
  for (const t of b.taken) {
    h.str(t.bargain).u32(t.offer).u32(t.hero).f64(t.tick);
  }
}

/** The modifiers when nothing is taken: every multiplier is exactly 1, so results are bit-identical to no layer. */
const IDENTITY_MODS: Mods = {
  dealt: () => 1,
  taken: () => 1,
  heal: () => 1,
  respawn: () => 1,
};

/** STUB (slice A): the modifier layer for `state`; rebuild or invalidate it when `state.taken` changes. */
export function createMods(_game: GameConfig, _state: BargainState | undefined): Mods {
  return IDENTITY_MODS;
}

/** What `heroDef` reads: a `TickContext` or a `Sim` both fit. */
export type DefSource = Pick<TickContext, 'game' | 'bargains'>;

/** STUB (slice A): the effective def of `hero` (base def with its `def` patches applied); undefined if it has none. */
export function heroDef(s: DefSource, hero: Readonly<Entity>): HeroDef | undefined {
  return findById(s.game.heroes, hero.def);
}

/** What the wave hooks read: a `TickContext` or a `Sim` both fit. */
export type WaveSource = Pick<TickContext, 'game' | 'bargains' | 'waves'>;

/** STUB (slice A): extra spawn groups every wave started now gets (accepted `waveExtra` effects). Schedule mode. */
export function bargainExtras(
  _s: WaveSource,
): readonly { readonly def: string; readonly count: number; readonly gap: number }[] {
  return [];
}

/** STUB (slice A): true while `pauseWaves` holds the wave clock because an offer is open. */
export function wavesPaused(_ctx: TickContext): boolean {
  return false;
}

/** STUB (slice A): extra wave-master budget (accepted `masterBudget` effects) granted when a wave starts. */
export function grantBudget(_ctx: TickContext): number {
  return 0;
}

/** STUB (slice A): runs right after `waveSystem`: opens offers when a wave ends, expires lapsed ones. */
export function bargainSystem(_ctx: TickContext): void {
  // Nothing opens offers yet.
}

/**
 * STUB (slice A): the `bargain` command. The first valid resolution of an offer wins; an unknown
 * offer, an unknown card or a second resolution is a silent no-op (the `cmd` event is still logged).
 */
export function applyBargainCommand(_ctx: TickContext, _cmd: BargainCommand): void {
  // Nothing resolves yet.
}
