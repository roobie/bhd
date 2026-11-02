// Bargains (wave 9, DESIGN 9a): relics with a gain and a cost on another axis. Content, not code:
// a `BargainDef` is a bundle of closed `Effect`s the sim's modifier layer interprets (sim/bargains.ts).
// Authored in seconds. A game without `GameConfig.bargains` has bargains off.
//
// The Ancient can be healed by a bargain but never hurt (D-2PNKLSQWVJEBSWPI): `validateBargains`
// rejects every effect that could reach it except `ancientHeal` with a value above 0.

import type { EnemyDef, UnitDefBase } from './types.ts';

/** Who an effect applies to, relative to the hero the card benefits. `allies` = every other hero. */
export type EffectTarget = 'self' | 'team' | 'allies';

/** A multiplier on one engine axis (1 = no change). `dealt`: damage dealt; `taken`: damage taken after armour; `healTaken`: heals received; `respawn`: respawn timer. */
interface MultEffect<K extends string> {
  readonly kind: K;
  readonly target: EffectTarget;
  readonly value: number;
}

/**
 * Closed set of effect kinds; the sim interprets each and nothing else.
 * - `def`: patches a number of a hero def (`path` like `zeal.maxBonus`) or, with `enemy`, of that enemy def.
 *   `op` `mul` multiplies, `add` adds. Never `leakDamage`.
 * - `ancientHeal`: heals the Ancient by `value` (a fraction of its max hp, 0 < value <= 1), once, on accept.
 * - `waveExtra`: `count` more of enemy `def` in every later wave (schedule mode).
 * - `masterBudget`: `value` more wave-master budget per later wave (master mode, where `waveExtra` is not used).
 */
export type Effect =
  | {
      readonly kind: 'def';
      readonly target: EffectTarget;
      readonly path: string;
      readonly op: 'mul' | 'add';
      readonly value: number;
      readonly enemy?: string;
    }
  | MultEffect<'dealt'>
  | MultEffect<'taken'>
  | MultEffect<'healTaken'>
  | MultEffect<'respawn'>
  | MultEffect<'ancientHeal'>
  | { readonly kind: 'waveExtra'; readonly target: EffectTarget; readonly def: string; readonly count: number }
  | MultEffect<'masterBudget'>;

export type EffectKind = Effect['kind'];

export interface BargainDef {
  readonly id: string;
  /** `hero`: bound to a hero of `kit` (that hero's player accepts); `team`: benefits everyone. */
  readonly scope: 'hero' | 'team';
  /** Hero kit the card is bound to; required when `scope` is `hero`. */
  readonly kit?: 'gunner' | 'penitent' | 'psyker' | 'standin';
  /** Waves the bargain lasts; absent = permanent (the shipped pool is permanent). */
  readonly durationWaves?: number;
  readonly gains: readonly Effect[];
  readonly costs: readonly Effect[];
}

export interface BargainsDef {
  /** Offers open when these waves (1-based, ascending) end. */
  readonly afterWaves: readonly number[];
  /** Cards per offer (besides Decline). */
  readonly cards: number;
  /** Seconds an offer stays open; a lapse counts as a decline. */
  readonly windowSeconds: number;
  /** True: the wave clock waits while an offer is open. B chose false (the clock keeps running). */
  readonly pauseWaves: boolean;
  /** Fraction of the Ancient's max hp a decline heals (0..1). */
  readonly declineAncientHeal: number;
  readonly pool: readonly BargainDef[];
}

/** True when `key` is an own property of `node`; on an array only index keys count (not `length`). */
function hasKey(node: unknown, key: string): node is Record<string, unknown> {
  if (typeof node !== 'object' || node === null) {
    return false;
  }
  if (Array.isArray(node) && !INDEX.test(key)) {
    return false;
  }
  return Object.hasOwn(node, key);
}

const INDEX = /^(?:0|[1-9]\d*)$/u;

/** Copy of `node` with `key` set to `value`; arrays stay arrays. */
function withKey(node: object, key: string, value: unknown): object {
  if (Array.isArray(node)) {
    const copy: unknown[] = [...node];
    copy[Number(key)] = value;
    return copy;
  }
  return { ...node, [key]: value };
}

/** `node` with the `def` patch `e` applied along `keys[i..]`; the same object when the path does not end at a finite number. */
function patchAt(node: unknown, keys: readonly string[], i: number, e: Extract<Effect, { kind: 'def' }>): unknown {
  const key = keys[i];
  if (key === undefined || !hasKey(node, key)) {
    return node;
  }
  const cur = node[key];
  if (i === keys.length - 1) {
    if (typeof cur !== 'number' || !Number.isFinite(cur)) {
      return node;
    }
    const next = e.op === 'mul' ? cur * e.value : cur + e.value;
    return Number.isFinite(next) ? withKey(node, key, next) : node;
  }
  const child = patchAt(cur, keys, i + 1, e);
  return child === cur ? node : withKey(node, key, child);
}

/**
 * A copy of `def` with the `def` effects among `effects` applied to it, in order (`mul` multiplies,
 * `add` adds). Pure; never mutates `def` and shares every untouched subtree with it; the same
 * object when nothing applied. Non-`def` effects are ignored, and so is a patch whose path is missing
 * or not a finite number. Validation already forbids a patch that misses a hero its target reaches, so
 * skipping is only a defensive fallback. Enemy patches (`enemy`) are rejected by validation; the field is ignored here.
 */
export function applyDefPatches<T extends object>(def: T, effects: readonly Effect[]): T {
  let out: unknown = def;
  for (const e of effects) {
    if (e.kind === 'def') {
      out = patchAt(out, e.path.split('.'), 0, e);
    }
  }
  return out as T;
}

/** The numeric leaf at dotted `path` of `node`, undefined if the path does not end at a finite number. */
function numberAt(node: unknown, path: string): number | undefined {
  let cur = node;
  for (const key of path.split('.')) {
    if (!hasKey(cur, key)) {
      return undefined;
    }
    cur = cur[key];
  }
  return typeof cur === 'number' && Number.isFinite(cur) ? cur : undefined;
}

/** What `validateBargains` reads of the game (kept structural so content/index.ts and this file do not import each other). */
export interface BargainWorld {
  readonly heroes: readonly (UnitDefBase & { readonly kit: string })[];
  readonly enemies: readonly EnemyDef[];
}

function fail(id: string, why: string): never {
  throw new Error(`game config: bargain '${id}': ${why}`);
}

function check(id: string, ok: boolean, why: string): void {
  if (!ok) {
    fail(id, why);
  }
}

const TARGETS: readonly string[] = ['self', 'team', 'allies'];
const KITS: readonly string[] = ['gunner', 'penitent', 'psyker', 'standin'];

/** The roster heroes an effect with `target` reaches on bargain `b`: self = the card's kit, allies = the others, team = all. */
function reachedHeroes(world: BargainWorld, b: BargainDef, target: EffectTarget): BargainWorld['heroes'] {
  if (b.scope !== 'hero' || target === 'team') {
    return world.heroes;
  }
  return world.heroes.filter((h) => (h.kit === b.kit) === (target === 'self'));
}

function checkDefEffect(world: BargainWorld, b: BargainDef, e: Extract<Effect, { kind: 'def' }>): void {
  if (!(Number.isFinite(e.value) && (e.op === 'mul' || e.op === 'add'))) {
    fail(b.id, `def patch '${e.path}' needs a finite value and op mul or add`);
  }
  if (e.enemy !== undefined) {
    fail(b.id, 'enemy def patches are not supported yet');
  }
  // Every hero the target reaches must have the path (a card whose kit is not in the roster is never offered).
  if (!reachedHeroes(world, b, e.target).every((h) => numberAt(h, e.path) !== undefined)) {
    fail(b.id, `unknown hero def path '${e.path}' for target '${e.target}'`);
  }
}

function checkEffect(world: BargainWorld, b: BargainDef, e: Effect): void {
  check(b.id, TARGETS.includes(e.target), `unknown effect target '${String(e.target)}'`);
  check(b.id, b.scope === 'hero' || e.target !== 'self', "a team-scope bargain may not use target 'self'");
  switch (e.kind) {
    case 'def':
      checkDefEffect(world, b, e);
      break;
    case 'dealt':
    case 'taken':
    case 'healTaken':
    case 'respawn':
      check(b.id, Number.isFinite(e.value) && e.value >= 0, `${e.kind} needs a finite value >= 0`);
      break;
    case 'ancientHeal':
      // The one effect allowed near the Ancient, and only as a heal.
      check(b.id, e.value > 0 && e.value <= 1, 'effects may not hurt the Ancient: ancientHeal needs 0 < value <= 1');
      break;
    case 'waveExtra':
      check(
        b.id,
        world.enemies.some((d) => d.id === e.def) && Number.isSafeInteger(e.count) && e.count >= 1,
        `waveExtra needs a known enemy def and a count >= 1, got '${e.def}' x ${e.count}`,
      );
      break;
    case 'masterBudget':
      check(b.id, Number.isFinite(e.value), 'masterBudget needs a finite value');
      break;
    default:
      fail(b.id, `unknown effect ${JSON.stringify(e)}`);
  }
}

function checkBargain(world: BargainWorld, b: BargainDef, ids: Set<string>): void {
  check(b.id, b.id.length > 0 && !ids.has(b.id), 'empty or duplicate id');
  ids.add(b.id);
  check(b.id, b.scope === 'hero' || b.scope === 'team', `unknown scope '${String(b.scope)}'`);
  check(
    b.id,
    b.scope !== 'hero' || (b.kit !== undefined && KITS.includes(b.kit)),
    'a hero-scoped bargain needs a known kit',
  );
  check(
    b.id,
    b.durationWaves === undefined || (Number.isSafeInteger(b.durationWaves) && b.durationWaves >= 1),
    'durationWaves must be an integer >= 1',
  );
  for (const e of [...b.gains, ...b.costs]) {
    checkEffect(world, b, e);
  }
}

/** Throws on a bad pool or a bad offer rule; see the header for the Ancient rule. */
export function validateBargains(world: BargainWorld, def: BargainsDef): void {
  const waves = def.afterWaves;
  if (!waves.every((n, i) => Number.isSafeInteger(n) && n >= 1 && n > (waves[i - 1] ?? 0))) {
    throw new Error('game config: bargains.afterWaves must be ascending integers >= 1');
  }
  if (
    !(Number.isSafeInteger(def.cards) && def.cards >= 1 && Number.isFinite(def.windowSeconds) && def.windowSeconds > 0)
  ) {
    throw new Error('game config: bargains.cards must be an integer >= 1 and windowSeconds > 0');
  }
  if (!(def.declineAncientHeal >= 0 && def.declineAncientHeal <= 1)) {
    throw new Error('game config: bargains.declineAncientHeal must be in 0..1');
  }
  const ids = new Set<string>();
  for (const b of def.pool) {
    checkBargain(world, b, ids);
  }
}
