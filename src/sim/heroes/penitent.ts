// Penitent "The Scourged" kit (D-IL3SV332IUGDBPFW). Owner: slice A (w8). STEP 1 STUB: the state
// shape, the dispatch entry points and the engine hooks exist and do nothing yet, so the hero
// stands there with no attack and no abilities.
// Every field added to PenitentState MUST be added to hashPenitent (L-53OTZPIIVO2XYNNL).
//
// Hooks the kit gets from the engine (heroes/index.ts routes them here):
// - damageTakenPenitent: Pain banks `hit.raw` (friendly fire x1.5, def.pain.friendlyFireMult),
//   Martyrdom halves the hp loss (hpLossMult) and sets `minHp: 1` so same-team `ff` cannot kill him.
// - healTakenPenitent: heals do def.pain.healMult (x0.25).
// - downPenitent: called when he goes down; Pain resets.
// Pain surfaces through perception as a ResourceView (src/perception/kits/penitent.ts).

import type { PenitentDef } from '../../content/heroes/penitent.ts';
import type { HeroCommand } from '../commands.ts';
import type { DamageTakenInput, DamageTakenResult, TickContext } from '../context.ts';
import type { Entity, KitBase } from '../entities.ts';
import type { StateHasher } from '../hash.ts';

export interface PenitentState extends KitBase {
  readonly kind: 'penitent';
  /** 0..def.pain.max. */
  pain: number;
  /** Last emitted Pain band (`resource` event). */
  painBand: number;
  /** Ticks since he last took damage (the Pain drain waits for def.pain.drainDelaySeconds). */
  calmTicks: number;
  cdChain: number;
  cdMartyrdom: number;
  /** Ticks of Martyrdom left (0 = not active). */
  martyrdomTicks: number;
  /** Ticks of Spent left (Pain locked at 0; 0 = not spent). */
  spentTicks: number;
}

export function initPenitent(_def: PenitentDef): PenitentState {
  return {
    kind: 'penitent',
    hold: false,
    autocast: 0,
    respawnAt: 0,
    pain: 0,
    painBand: 0,
    calmTicks: 0,
    cdChain: 0,
    cdMartyrdom: 0,
    martyrdomTicks: 0,
    spentTicks: 0,
  };
}

/** Everything a kit function needs about one hero. */
export interface PenitentRun {
  readonly ctx: TickContext;
  readonly hero: Entity;
  readonly kit: PenitentState;
  readonly def: PenitentDef;
}

export function tickPenitent(_run: PenitentRun): void {
  // Slice A.
}

/** Called after commandHero applied move / stop / hold / autocast; handles `ability`. */
export function commandPenitent(_run: PenitentRun, _cmd: HeroCommand): void {
  // Slice A.
}

export function damageTakenPenitent(_run: PenitentRun, hit: DamageTakenInput): DamageTakenResult {
  return { amount: hit.amount, minHp: 0 };
}

export function healTakenPenitent(_run: PenitentRun, amount: number): number {
  return amount;
}

export function downPenitent(_run: PenitentRun): void {
  // Slice A: Pain resets.
}

/** Hashes the kit's own fields; hold, autocast and respawnAt are hashed by the dispatcher. */
export function hashPenitent(h: StateHasher, kit: PenitentState): void {
  h.f64(kit.pain).u32(kit.painBand).u32(kit.calmTicks).u32(kit.cdChain).u32(kit.cdMartyrdom);
  h.u32(kit.martyrdomTicks).u32(kit.spentTicks);
}
