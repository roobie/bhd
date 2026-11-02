// Config overrides: a JSON patch layered on the shipped game, bot and Director config. Pure.
//
// Shape: `{game?, bots?, director?}`, each a nested object patch.
//  - Objects merge key by key; a key the base does not have throws (typos must not pass silently).
//  - A scalar must keep its type (number stays number).
//  - An array in the patch replaces the base array.
//  - An array of `{id}` objects (enemies, heroes, statuses, doctrines...) can also be patched as an
//    object keyed by id: `{"enemies": {"grunt": {"maxHp": 30}}}` merges into the element with that
//    id; an unknown id throws.
//  - A doctrine's `weights` may be added to, with keys that exist in `bots.kitWeights`.
// The merged game goes through `validateGame`. Nothing here mutates its inputs.

import type { BotSetup } from './bots.ts';
import { validateBots } from './bots.ts';
import type { DirectorDef } from './director.ts';
import type { GameConfig } from './index.ts';
import { validateGame } from './index.ts';

interface JsonObject {
  readonly [key: string]: unknown;
}

/** A patch for the three config parts; JSON-shaped (`readFileSync` + `JSON.parse` gives one). */
export interface ConfigOverrides {
  readonly game?: JsonObject;
  readonly bots?: JsonObject;
  readonly director?: JsonObject;
}

/** The configuration a game runs with: what `GameSpec` resolves to. `director` is set in director mode only. */
export interface RunConfig {
  readonly game: GameConfig;
  readonly bots: BotSetup;
  readonly director?: DirectorDef;
}

const PARTS = ['game', 'bots', 'director'] as const;

function isObject(v: unknown): v is JsonObject {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function hasId(v: unknown): v is JsonObject & { readonly id: string } {
  return isObject(v) && typeof v.id === 'string';
}

function at(path: readonly string[]): string {
  return path.join('.');
}

function mergeById(base: readonly unknown[], patch: JsonObject, path: readonly string[], kit: JsonObject): unknown[] {
  if (!base.every(hasId)) {
    throw new TypeError(`overrides: ${at(path)} is an array without ids, give a whole array`);
  }
  const out: unknown[] = [...base];
  for (const [id, p] of Object.entries(patch)) {
    const i = base.findIndex((e) => hasId(e) && e.id === id);
    if (i < 0) {
      throw new RangeError(`overrides: ${at(path)} has no element with id '${id}'`);
    }
    out[i] = merge(base[i], p, [...path, id], kit);
  }
  return out;
}

function isDoctrine(path: readonly string[]): boolean {
  return path.length === 3 && path[0] === 'bots' && path[1] === 'doctrines';
}

/** A doctrine's `weights`: any key of `bots.kitWeights`, numbers only. */
function mergeWeights(base: JsonObject, patch: JsonObject, path: readonly string[], kit: JsonObject): JsonObject {
  const out: Record<string, unknown> = { ...base };
  for (const [key, p] of Object.entries(patch)) {
    if (!Object.hasOwn(kit, key) || typeof p !== 'number') {
      throw new RangeError(`overrides: ${at([...path, key])} needs a number and a key of bots.kitWeights`);
    }
    out[key] = p;
  }
  return out;
}

function mergeObject(base: JsonObject, patch: JsonObject, path: readonly string[], kit: JsonObject): JsonObject {
  if (path.length === 4 && isDoctrine(path.slice(0, 3)) && path[3] === 'weights') {
    return mergeWeights(base, patch, path, kit);
  }
  const out: Record<string, unknown> = { ...base };
  for (const [key, p] of Object.entries(patch)) {
    const next = [...path, key];
    if (Object.hasOwn(base, key)) {
      out[key] = merge(base[key], p, next, kit);
    } else if (isDoctrine(path) && key === 'weights' && isObject(p)) {
      out[key] = mergeWeights({}, p, next, kit);
    } else {
      throw new RangeError(`overrides: unknown key ${at(next)}`);
    }
  }
  return out;
}

function merge(base: unknown, patch: unknown, path: readonly string[], kit: JsonObject): unknown {
  if (Array.isArray(patch)) {
    if (!Array.isArray(base)) {
      throw new TypeError(`overrides: ${at(path)} is not an array`);
    }
    return [...patch];
  }
  if (isObject(patch)) {
    if (Array.isArray(base)) {
      return mergeById(base, patch, path, kit);
    }
    if (!isObject(base)) {
      throw new TypeError(`overrides: ${at(path)} is not an object`);
    }
    return mergeObject(base, patch, path, kit);
  }
  if (typeof patch !== typeof base || patch === null) {
    throw new TypeError(
      `overrides: ${at(path)} must be a ${typeof base}, got ${patch === null ? 'null' : typeof patch}`,
    );
  }
  return patch;
}

/**
 * `base` with `overrides` merged in, validated. Throws on unknown keys or ids, on a type change, on
 * a `director` patch when `base` has no Director, and when the game config does not validate.
 */
export function applyOverrides(base: RunConfig, overrides: ConfigOverrides | undefined): RunConfig {
  if (overrides === undefined) {
    validateGame(base.game);
    validateBots(base.bots);
    return base;
  }
  for (const key of Object.keys(overrides)) {
    if (!(PARTS as readonly string[]).includes(key)) {
      throw new RangeError(`overrides: unknown key ${key} (expected game, bots or director)`);
    }
  }
  if (overrides.director !== undefined && base.director === undefined) {
    throw new RangeError("overrides: 'director' needs director mode");
  }
  const kit = base.bots.kitWeights;
  const game = overrides.game === undefined ? base.game : merge(base.game, overrides.game, ['game'], kit);
  const bots = overrides.bots === undefined ? base.bots : merge(base.bots, overrides.bots, ['bots'], kit);
  const director =
    overrides.director === undefined || base.director === undefined
      ? base.director
      : merge(base.director, overrides.director, ['director'], kit);
  // The merge keeps the base's shape and only swaps same-typed values, so these casts hold.
  const out = {
    game: game as GameConfig,
    bots: bots as BotSetup,
    ...(director === undefined ? {} : { director: director as DirectorDef }),
  };
  validateGame(out.game);
  validateBots(out.bots);
  return out;
}
