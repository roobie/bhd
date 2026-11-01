// Entity model and store (wave DESIGN.md "Entity model"). One record per entity. Later slices do
// not add fields: per-kit state lives in `kit`. Every field here is hashed (hash.ts); a new field
// MUST be added to the hash (L-53OTZPIIVO2XYNNL).
// IDs are monotonic integers, never reused, iterated in ID order (project DESIGN.md §6.1).

import type { GunnerState } from './heroes/gunner.ts';
import type { StandinState } from './heroes/standins.ts';

export type EntityKind = 'hero' | 'enemy' | 'ancient';

/** Stable numeric codes for the state hash. Append only; never renumber. */
export const ENTITY_KIND_CODE: Readonly<Record<EntityKind, number>> = { hero: 1, enemy: 2, ancient: 3 };

/** 0 = defenders (heroes, Ancient), 1 = attackers. */
export type Team = 0 | 1;

/** One live status. Kept sorted by (status, src) in `Entity.statuses`. */
export interface StatusInstance {
  readonly status: string;
  /** First tick the status is gone (it is active while tick < until). */
  until: number;
  readonly src: number;
  value: number;
}

export type MoveMode = 'idle' | 'point' | 'lane';

/** Stable numeric codes for the state hash. Append only; never renumber. */
export const MOVE_MODE_CODE: Readonly<Record<MoveMode, number>> = { idle: 0, point: 1, lane: 2 };

interface MoveState {
  mode: MoveMode;
  /** Target for `point`. */
  tx: number;
  ty: number;
  /** Index of the lane waypoint being walked to (`lane` mode). `lane.length` means arrived. */
  waypoint: number;
}

interface AttackState {
  /** Ticks left before the next attack. */
  cooldown: number;
  /** Current target id, 0 for none. */
  target: number;
}

/**
 * State every hero kit shares, set by `commandHero` and hashed once by the dispatcher
 * (heroes/index.ts); a kit's own hash covers only its extra fields.
 */
export interface KitBase {
  /** Hold fire: no attacks while set. */
  hold: boolean;
  /** Autocast toggles, bit i = ability slot i (4 bits). */
  autocast: number;
}

/** Hero-only per-kit state, discriminated on `kind`; each member is defined in its kit's file and extends `KitBase`. */
export type HeroKitState = GunnerState | StandinState;

export interface Entity {
  readonly id: number;
  readonly kind: EntityKind;
  /** Content id of the definition (hero, enemy, or 'ancient'). */
  readonly def: string;
  readonly team: Team;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  armour: number;
  /** World units per tick. */
  speed: number;
  statuses: StatusInstance[];
  move: MoveState;
  attack: AttackState;
  kit?: HeroKitState;
}

/** Everything `add` needs; `kit` is set for heroes only. */
export interface NewEntity {
  readonly kind: EntityKind;
  readonly def: string;
  readonly team: Team;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly maxHp: number;
  readonly armour: number;
  readonly speed: number;
  readonly move?: MoveState;
  readonly kit?: HeroKitState;
}

/** Read-only view for code outside the sim (client, bots, perception) and for queries. */
export interface EntityView {
  readonly size: number;
  readonly get: (id: number) => Readonly<Entity> | undefined;
  readonly values: () => IterableIterator<Readonly<Entity>>;
}

export class EntityStore implements EntityView {
  // Map iterates in insertion order. IDs only grow and are never re-inserted, so insertion order is ID order.
  readonly #byId = new Map<number, Entity>();
  #nextId = 1;

  /** The ID the next `add` will return. Part of the hashed state. */
  get nextId(): number {
    return this.#nextId;
  }

  get size(): number {
    return this.#byId.size;
  }

  add(init: NewEntity): Entity {
    const id = this.#nextId;
    this.#nextId = id + 1;
    const e: Entity = {
      id,
      kind: init.kind,
      def: init.def,
      team: init.team,
      x: init.x,
      y: init.y,
      radius: init.radius,
      hp: init.maxHp,
      maxHp: init.maxHp,
      armour: init.armour,
      speed: init.speed,
      statuses: [],
      move: init.move ?? { mode: 'idle', tx: init.x, ty: init.y, waypoint: 0 },
      attack: { cooldown: 0, target: 0 },
    };
    if (init.kit !== undefined) {
      e.kit = init.kit;
    }
    this.#byId.set(id, e);
    return e;
  }

  get(id: number): Entity | undefined {
    return this.#byId.get(id);
  }

  remove(id: number): boolean {
    return this.#byId.delete(id);
  }

  /** Live entities in ascending ID order. */
  values(): MapIterator<Entity> {
    return this.#byId.values();
  }
}
