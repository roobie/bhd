// Shared definition shapes for game content. Data is authored in SECONDS and PER-SECOND units
// (distance in world units); sim code converts with src/sim/time.ts. Pure data: no behaviour here
// except the lookup helper.

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A basic attack. `range` in world units, `cooldown` in seconds between attacks. */
interface AttackDef {
  readonly damage: number;
  readonly range: number;
  readonly cooldown: number;
}

/** Fields every unit definition shares. `speed` is world units per second. */
export interface UnitDefBase {
  readonly id: string;
  readonly radius: number;
  readonly maxHp: number;
  readonly armour: number;
  readonly speed: number;
  readonly attack: AttackDef;
}

export interface EnemyDef extends UnitDefBase {
  /** Damage dealt to the Ancient when the enemy reaches the end of the lane. */
  readonly leakDamage: number;
}

/** A status kind. `duration` in seconds (default for appliers); `value` is the status-specific magnitude. */
export interface StatusDef {
  readonly id: string;
  readonly duration: number;
  readonly value: number;
}

interface AncientDef {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly maxHp: number;
}

export interface MapDef {
  readonly width: number;
  readonly height: number;
  /** Waypoints enemies walk in order; the last one is where they leak. */
  readonly lane: readonly Point[];
  readonly ancient: AncientDef;
  /** Where lineup hero i starts (index wraps if the lineup is longer). */
  readonly heroSpawns: readonly Point[];
}

/** `count` enemies of `def`, one every `gap` seconds. */
interface SpawnGroup {
  readonly def: string;
  readonly count: number;
  readonly gap: number;
}

export interface WaveDef {
  readonly spawns: readonly SpawnGroup[];
}

/** Wave n (1-based) starts `firstDelay + (n - 1) * interval` seconds in. After the last wave nothing spawns. */
export interface WaveSchedule {
  readonly firstDelay: number;
  readonly interval: number;
  readonly waves: readonly WaveDef[];
}

/** Linear lookup; definition lists are tiny and an array keeps configs plain JSON. */
export function findById<T extends { readonly id: string }>(list: readonly T[], id: string): T | undefined {
  return list.find((d) => d.id === id);
}
