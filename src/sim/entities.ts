// Entity store: monotonic integer IDs, never reused, iterated in ID order (DESIGN.md §6.1).

/** Entity types. `dummy` is a wave-0 placeholder; wave 1 adds heroes, enemies, projectiles. */
export type EntityType = 'dummy';

/** Stable numeric codes for the state hash. Append only; never renumber. */
export const ENTITY_TYPE_CODE: Readonly<Record<EntityType, number>> = { dummy: 1 };

export interface Entity {
  readonly id: number;
  readonly type: EntityType;
  x: number;
  y: number;
  // Placeholder locomotion (wave 1 replaces): move toward (tx, ty) at `speed` units per tick.
  speed: number;
  moving: boolean;
  tx: number;
  ty: number;
}

/** Read-only view for code outside the sim (client, bots, perception). */
export interface EntityView {
  readonly size: number;
  readonly get: (id: number) => Readonly<Entity> | undefined;
  readonly values: () => IterableIterator<Readonly<Entity>>;
}

/** Placeholder default speed in world units per tick. */
const DUMMY_SPEED = 0.25;

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

  add(type: EntityType, x: number, y: number): Entity {
    const id = this.#nextId;
    this.#nextId = id + 1;
    const e: Entity = { id, type, x, y, speed: DUMMY_SPEED, moving: false, tx: x, ty: y };
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
