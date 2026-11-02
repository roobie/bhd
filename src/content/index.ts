// GameConfig: everything the sim needs to know about a game, passed in rather than imported, so
// the reporter can compare two configs without a code change. `defaultGame()` is the shipping
// config. Content is authored in seconds / per-second units (see types.ts).

import type { BargainsDef } from './bargains.ts';
import { validateBargains } from './bargains.ts';
import type { MasterDef } from './director.ts';
import { defaultMaster } from './director.ts';
import { defaultEnemies } from './enemies.ts';
import type { GunnerDef } from './heroes/gunner.ts';
import { gunnerDef } from './heroes/gunner.ts';
import type { PenitentDef } from './heroes/penitent.ts';
import { penitentDef } from './heroes/penitent.ts';
import type { PsykerDef } from './heroes/psyker.ts';
import { psykerDef } from './heroes/psyker.ts';
import type { StandinDef } from './heroes/standins.ts';
import { standinDefs } from './heroes/standins.ts';
import type { IntentsDef } from './intents.ts';
import { defaultIntents } from './intents.ts';
import { defaultMap } from './map.ts';
import type { RulesDef } from './rules.ts';
import { defaultRules } from './rules.ts';
import { defaultStatuses } from './statuses.ts';
import type { EnemyDef, MapDef, StatusDef, WaveSchedule } from './types.ts';
import { defaultWaves } from './waves.ts';

/** A hero definition; `kit` selects the sim's kit implementation. */
export type HeroDef = GunnerDef | PenitentDef | PsykerDef | StandinDef;

export interface GameConfig {
  readonly map: MapDef;
  readonly enemies: readonly EnemyDef[];
  readonly statuses: readonly StatusDef[];
  readonly waves: WaveSchedule;
  /** The team: spawned in order at the map's hero spawns. */
  readonly heroes: readonly HeroDef[];
  /** Intents board limits. */
  readonly intents: IntentsDef;
  /** Respawn, team wipe and leash knobs. */
  readonly rules: RulesDef;
  /**
   * Set = wave master mode: the wave schedule supplies only the clock and the wave count; waves
   * are bought with `summon` commands and may start early with `send` (sim/master.ts). Unset =
   * schedule mode (the waves' own compositions spawn).
   */
  readonly master?: MasterDef;
  /** Set = bargains on (sim/bargains.ts). Unset = off. Absent from `defaultGame()` until wave 9 step 3. */
  readonly bargains?: BargainsDef;
}

/** The support stand-in without the pull (Gravitic Lash is the Psyker's now): the fourth seat of the w8 lineup. */
function supportSeat(): StandinDef {
  const support = standinDefs().find((d) => d.role === 'support');
  if (support === undefined) {
    throw new Error('no support stand-in');
  }
  return { ...support, abilities: support.abilities.filter((a) => a.effect !== 'pull') };
}

/** A fresh config each call, so callers can derive variants without sharing mutable state. */
export function defaultGame(): GameConfig {
  return {
    map: defaultMap(),
    enemies: defaultEnemies(),
    statuses: defaultStatuses(),
    waves: defaultWaves(),
    // Gunner, Penitent, Psyker, and the support stand-in as the fourth seat (w8 solo lineup).
    heroes: [gunnerDef(), penitentDef(), psykerDef(), supportSeat()],
    intents: defaultIntents(),
    rules: defaultRules(),
  };
}

/** `defaultGame()` in wave master mode: the same lane and roster, waves bought by the Director. */
export function defaultMasterGame(): GameConfig {
  return { ...defaultGame(), master: defaultMaster() };
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
  const { respawn } = game.rules;
  if (!(respawn.base >= 0 && respawn.perWave >= 0 && respawn.max >= 0 && game.rules.leashRange > 0)) {
    throw new Error('game config: rules.respawn values must be >= 0 and rules.leashRange > 0');
  }
  if (!(game.rules.callWaveMinSeconds >= 0)) {
    throw new Error('game config: rules.callWaveMinSeconds must be >= 0');
  }
  const { master } = game;
  if (master !== undefined) {
    for (const c of master.costs) {
      if (!(game.enemies.some((e) => e.id === c.def) && c.cost > 0)) {
        throw new Error(`game config: master cost for '${c.def}' needs a known enemy and a positive cost`);
      }
    }
    if (master.budgetPerWave.length === 0) {
      throw new Error('game config: master.budgetPerWave must not be empty');
    }
  }
  if (game.bargains !== undefined) {
    validateBargains(game, game.bargains);
  }
}
