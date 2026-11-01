import type { GameConfig } from '../content/index.ts';
import type { Rng } from '../detmath/index.ts';
import type { IntentBoard } from '../intents/board.ts';
import type { DamageSpec } from './combat.ts';
import type { Entity, EntityStore } from './entities.ts';
import type { EndReason, SimEvent } from './events.ts';
import type { MasterState } from './master.ts';
import type { WaveState } from './waves.ts';

/** Input of the `damageTaken` hook (see `TickContext.hooks`). */
export interface DamageTakenInput {
  readonly victim: Entity;
  readonly spec: DamageSpec;
  /** The amount after Marked, Clumped and armour, before any kit reduction. Pain banks this. */
  readonly raw: number;
  /** Same as `raw` on entry; kept separate so the contract reads `amount in, amount out`. */
  readonly amount: number;
}

/**
 * What a kit says about a hit it is taking. `amount` is the damage to apply (halving, ff scaling);
 * `minHp` is the floor friendly fire (same-team `ff` hits only) cannot take the victim below. 0 = no floor.
 */
export interface DamageTakenResult {
  readonly amount: number;
  readonly minHp: number;
}

/**
 * Per-victim hooks, dispatched to the hero kit by heroes/index.ts (built there so combat.ts does
 * not import the kits: the same pattern as `cast`). A victim without a kit gets the identity.
 */
export interface Hooks {
  /** Called by `dealDamage` after the modifiers and before `hp -= amount`. */
  readonly damageTaken: (ctx: TickContext, hit: DamageTakenInput) => DamageTakenResult;
  /** Called by `heal` before `hp += amount`; returns the amount to restore (before the maxHp cap). */
  readonly healTaken: (ctx: TickContext, target: Entity, amount: number) => number;
}

/** What a system or command handler may touch during one tick. */
export interface TickContext {
  readonly tick: number;
  readonly entities: EntityStore;
  /** Game seed (uint32); kit RNG streams derive from it (`deriveRng(seed, 'kit:<kit>:<entityId>')`). */
  readonly seed: number;
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
   * hero and slot). For the intents phase only: calling it from another phase would reorder the
   * kit's events relative to the tick order in `Sim.step`.
   */
  readonly cast: (hero: number, slot: number, at?: { readonly x: number; readonly y: number }) => boolean;
  /** Entity id of the Ancient. */
  readonly ancientId: number;
  /**
   * Victim id -> id of whoever took it to 0 hp this tick. Transient (cleared every tick, not
   * hashed): `dealDamage` records it, the deaths system reads it for the `death` event.
   */
  readonly killers: Map<number, number>;
  /** Kit hooks (damage taken, heal taken). */
  readonly hooks: Hooks;
  /** Ends the game: emits `end` once and stops gameplay (see Sim). */
  readonly end: (reason: EndReason) => void;
}
