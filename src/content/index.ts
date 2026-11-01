// GameConfig: everything the sim needs to know about a game, passed in rather than imported, so
// the reporter can compare two configs without a code change. `defaultGame()` is the shipping
// config. Content is authored in seconds / per-second units (see types.ts).

import { defaultEnemies } from './enemies.ts';
import type { GunnerDef } from './heroes/gunner.ts';
import { gunnerDef } from './heroes/gunner.ts';
import type { StandinDef } from './heroes/standins.ts';
import { standinDefs } from './heroes/standins.ts';
import { defaultMap } from './map.ts';
import { defaultStatuses } from './statuses.ts';
import type { EnemyDef, MapDef, StatusDef, WaveSchedule } from './types.ts';
import { defaultWaves } from './waves.ts';

/** A hero definition; `kit` selects the sim's kit implementation. */
export type HeroDef = GunnerDef | StandinDef;

export interface GameConfig {
  readonly map: MapDef;
  readonly enemies: readonly EnemyDef[];
  readonly statuses: readonly StatusDef[];
  readonly waves: WaveSchedule;
  /** The team: spawned in order at the map's hero spawns. */
  readonly heroes: readonly HeroDef[];
}

/** A fresh config each call, so callers can derive variants without sharing mutable state. */
export function defaultGame(): GameConfig {
  return {
    map: defaultMap(),
    enemies: defaultEnemies(),
    statuses: defaultStatuses(),
    waves: defaultWaves(),
    heroes: [gunnerDef(), ...standinDefs()],
  };
}

function checkFinite(value: unknown, path: string): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new RangeError(`game config: ${path} must be a finite number, got ${value}`);
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, v] of Object.entries(value)) {
      checkFinite(v, `${path}.${key}`);
    }
  }
}

function checkUnique(ids: readonly string[], what: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`game config: duplicate ${what} id '${id}'`);
    }
    seen.add(id);
  }
}

/**
 * Throws if the config has a non-finite number anywhere, or ids that collide (enemy and hero defs
 * share one id space, since debug spawn and hashing look defs up by id; status ids their own).
 */
export function validateGame(game: GameConfig): void {
  checkFinite(game, 'game');
  checkUnique([...game.enemies.map((d) => d.id), ...game.heroes.map((d) => d.id)], 'unit');
  checkUnique(
    game.statuses.map((s) => s.id),
    'status',
  );
}
