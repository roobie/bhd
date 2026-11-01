// Perception: the derived view bots, the Director and the viewer read (wave w2-bots DESIGN
// "Perception"). Plain copied data, never sim objects. Owner: contracts (shapes fixed here; the
// perception slice fills the numbers in perceive / memory / clumps / threat / combos).
// Hero bots see what a player sees; the master's budget and queue are in `MasterView`, which only
// the Director gets (see `perceiveMaster`).

import type { Point } from '../content/types.ts';

export interface StatusView {
  readonly status: string;
  /** First tick the status is gone. */
  readonly until: number;
  readonly src: number;
  readonly value: number;
}

/** A hero resource (e.g. the Gunner's heat): `frac` 0..1, `band` the last emitted band (0 when none). */
export interface ResourceView {
  readonly name: string;
  readonly frac: number;
  readonly band: number;
  /** Thresholds 0..1, ascending, where the resource changes regime (the Gunner: pierce, overpen, 1). Empty when none. */
  readonly marks: readonly number[];
}

export interface AbilityView {
  readonly slot: number;
  /** Effect label: gunner `brace | vent | pavise | furnace`; penitent `chain | martyrdom`; psyker `lash`; stand-ins `taunt | mark | heal | pull`. */
  readonly effect: string;
  /** Ready to cast now (cooldown over and not locked out). */
  readonly ready: boolean;
  /** Ticks until ready, 0 when ready. */
  readonly cooldownLeft: number;
  /** The full cooldown in ticks, 0 if the ability has none. `cooldownLeft / cooldownTicks` is the sweep. */
  readonly cooldownTicks: number;
  /** Cast range from the hero, 0 if none. */
  readonly range: number;
  /** Area radius, 0 if none. */
  readonly radius: number;
}

/** Gunner-only state. */
export interface GunnerView {
  /** 0..1. */
  readonly heat: number;
  /** 0..1. */
  readonly spin: number;
  readonly braced: boolean;
  /** No fire for now (overheat or forced vent). */
  readonly locked: boolean;
  readonly furnaceActive: boolean;
  /** Basic attack range, free stance. */
  readonly attackRange: number;
  /** Basic attack range while braced. */
  readonly bracedRange: number;
  /** Cosine of the half angle of the braced firing arc. */
  readonly arcCos: number;
  /** Cosine of the half angle of the Vent cone. */
  readonly ventCos: number;
  /** Half the width of the overpenetration line. */
  readonly lineHalfWidth: number;
  /** Farthest the Pavise is placed from the Gunner. */
  readonly paviseRange: number;
  /** Half the Pavise's width. */
  readonly paviseHalfLength: number;
  /** Above this heat, rounds pierce armour (0..1). */
  readonly pierceAbove: number;
  /** Above this heat, rounds overpenetrate into allies (0..1). */
  readonly overpenAbove: number;
}

type HeroRole = 'gunner' | 'penitent' | 'psyker' | 'tank' | 'ranged' | 'support';

export interface HeroView {
  /** Entity id. */
  readonly id: number;
  /** Lineup index 0-3. */
  readonly slot: number;
  readonly def: string;
  readonly kit: 'gunner' | 'penitent' | 'psyker' | 'standin';
  readonly role: HeroRole;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly hpFrac: number;
  /** Incoming damage per second from nearby enemies as a fraction of max hp (threat.ts). */
  readonly threat: number;
  /** Hp this hero lost within the memory window, as a fraction of its max hp (memory.ts). */
  readonly recentDamage: number;
  readonly resources: readonly ResourceView[];
  /** One entry per ability the hero has, ascending by slot. */
  readonly abilities: readonly AbilityView[];
  readonly statuses: readonly StatusView[];
  /** Where the hero is walking to (`move` mode `point`), undefined when it is not. */
  readonly dest: Point | undefined;
  /** Current attack target id, 0 for none. */
  readonly target: number;
  readonly hold: boolean;
  /** Autocast bitmask: bit `slot` set means that ability autocasts. */
  readonly autocast: number;
  /**
   * Allies (hero ids, ascending) the hero's overpenetration line would hit now: the segment from its
   * muzzle toward its current target, as long as its effective range (brace included), widened by the
   * line half width. Independent of heat, so it says who an overpenetrating shot would hit. Empty
   * without a target and for stand-ins.
   */
  readonly lineAllies: readonly number[];
  readonly gunner?: GunnerView;
}

/** A hero that is down, waiting to respawn (it is not in `Perception.heroes`). */
export interface FallenView {
  readonly id: number;
  readonly slot: number;
  readonly def: string;
  /** Ticks until it respawns. */
  readonly respawnTicks: number;
}

export interface EnemyView {
  readonly id: number;
  readonly def: string;
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly hpFrac: number;
  /** Distance walked along the lane (world units), 0 at its start. */
  readonly progress: number;
  /** Damage per second of its basic attack. */
  readonly dps: number;
  /** Id it attacks, 0 for none. */
  readonly target: number;
  readonly statuses: readonly StatusView[];
}

/**
 * Enemies close together. Built by sweeping enemies in descending lane `progress` then ascending id;
 * each joins the first clump whose centroid is within `clumpRadius`, else starts a new one. Every
 * enemy is in exactly one clump; clumps are ordered by their first member's sweep position.
 */
export interface Clump {
  /** Index in `Perception.clumps`. */
  readonly id: number;
  /** Member enemy ids in sweep order. */
  readonly members: readonly number[];
  /** Centroid. */
  readonly x: number;
  readonly y: number;
  readonly count: number;
  /** Highest lane progress among the members. */
  readonly front: number;
}

/** A status zone worth a payoff now: `count` enemies carry `status` around (x, y) until tick `until`. */
export interface ComboWindow {
  readonly status: string;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly count: number;
  readonly until: number;
}

export interface AncientView {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly hp: number;
  readonly hpFrac: number;
}

interface WaveGroupView {
  readonly def: string;
  readonly count: number;
}

interface WaveView {
  /** Waves started so far. */
  readonly n: number;
  /** Waves in the game. */
  readonly total: number;
  /** Tick the next wave's clock fires at. */
  readonly nextAt: number;
  /** Next wave's composition as the schedule lists it; empty in wave master mode (nobody sees the queue). */
  readonly preview: readonly WaveGroupView[];
}

export interface IntentView {
  readonly id: number;
  readonly by: number;
  readonly intentKind: string;
  readonly x: number;
  readonly y: number;
  readonly fireTick: number;
  readonly fired: boolean;
  /** Hero ids with a reservation on it, ascending. */
  readonly reservers: readonly number[];
}

export interface TeamView {
  /** Heroes' total hp over their total max hp. */
  readonly hpFrac: number;
  /** Heroes at or below `lowHpFrac`. */
  readonly lowHeroes: number;
  /** Hero hp lost within the memory window, as a fraction of the team's total max hp. */
  readonly damageFrac: number;
  /** Leaks within the memory window. */
  readonly leaks: number;
  /** Ancient lives lost to those leaks. */
  readonly livesLost: number;
}

export interface Perception {
  readonly tick: number;
  /** Ascending by slot. */
  readonly heroes: readonly HeroView[];
  /** Heroes that are down (hp 0, waiting to respawn), ascending by slot. Not in `heroes`. */
  readonly fallen: readonly FallenView[];
  /** Ascending by id. */
  readonly enemies: readonly EnemyView[];
  readonly clumps: readonly Clump[];
  readonly comboWindows: readonly ComboWindow[];
  readonly ancient: AncientView;
  readonly wave: WaveView;
  /** Live intents, ascending by id. */
  readonly intents: readonly IntentView[];
  readonly team: TeamView;
}

/** What only the Director sees (wave master mode). */
export interface MasterView {
  readonly budget: number;
  /** The pending wave. */
  readonly pending: readonly WaveGroupView[];
  /** Cost per unit of each summonable enemy def, and the first wave it may be bought for. */
  readonly costs: readonly { readonly def: string; readonly cost: number; readonly unlockWave: number }[];
  /** First tick a `send` is allowed (the previous wave's start plus the minimum interval). */
  readonly sendAt: number;
  /** Tick the next wave starts by itself. */
  readonly nextAt: number;
  /** Waves left to start. */
  readonly wavesLeft: number;
}
