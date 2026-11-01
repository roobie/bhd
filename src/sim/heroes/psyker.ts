// Psyker "Warp Gambler" kit (D-4TKP7DQRMLBK6K7W). Owner: slice B (w8). STEP 1 STUB: the state
// shape, the dispatch entry points and the kit RNG exist and do nothing yet, so the hero stands
// there with no attack and no abilities.
// Every field added to PsykerState MUST be added to hashPsyker (L-53OTZPIIVO2XYNNL).
//
// Kit RNG: `kit.rng` is derived at spawn from the game seed and the hero's entity id
// (`deriveRng(seed, 'kit:psyker:<id>')`, heroes/index.ts) and HASHED here, so the backlash roll is
// replayable and never touches the sim stream `ctx.rng`. Draw from it with `nextFloat(kit.rng)`.
// Warp surfaces through perception as a ResourceView plus a second one named `backlash`
// (src/perception/kits/psyker.ts).

import type { PsykerDef } from '../../content/heroes/psyker.ts';
import type { Rng } from '../../detmath/index.ts';
import type { HeroCommand } from '../commands.ts';
import type { TickContext } from '../context.ts';
import type { Entity, KitBase } from '../entities.ts';
import type { StateHasher } from '../hash.ts';

export interface PsykerState extends KitBase {
  readonly kind: 'psyker';
  /** The kit's own stream (see the file header). */
  readonly rng: Rng;
  /** 0..def.warp.max. */
  warp: number;
  /** Last emitted Warp band (`resource` event). */
  warpBand: number;
  cdLash: number;
}

export function initPsyker(_def: PsykerDef, rng: Rng): PsykerState {
  return { kind: 'psyker', hold: false, autocast: 0, respawnAt: 0, rng, warp: 0, warpBand: 0, cdLash: 0 };
}

/** Everything a kit function needs about one hero. */
export interface PsykerRun {
  readonly ctx: TickContext;
  readonly hero: Entity;
  readonly kit: PsykerState;
  readonly def: PsykerDef;
}

export function tickPsyker(_run: PsykerRun): void {
  // Slice B.
}

/** Called after commandHero applied move / stop / hold / autocast; handles `ability`. */
export function commandPsyker(_run: PsykerRun, _cmd: HeroCommand): void {
  // Slice B.
}

export function downPsyker(_run: PsykerRun): void {
  // Slice B: Warp resets.
}

/** Hashes the kit's own fields (the RNG words included); hold, autocast and respawnAt are hashed by the dispatcher. */
export function hashPsyker(h: StateHasher, kit: PsykerState): void {
  for (const w of kit.rng.state) {
    h.u32(w);
  }
  h.f64(kit.warp).u32(kit.warpBand).u32(kit.cdLash);
}
