// Commands: the only input that changes sim state (project DESIGN.md §3). Lockstep sends exactly
// these. Plain JSON data so they serialize unchanged into the event log and over the wire.
// Validation is shape only; commands naming missing entities or bad targets are semantic no-ops
// (still logged). No ownership checks until wave 10.
//
// Wave-master, intents and bargain commands are routed to sim/master.ts, intents/board.ts and sim/bargains.ts.
//
// Adding a command: extend the union, `isValidCommand`, `canonicalCommand` and `applyCommand`
// (exhaustiveness checks catch kinds, not new optional fields) and the scenario in
// test/determinism/scenario.ts.

import { findById } from '../content/types.ts';
import { applyIntentCommand } from '../intents/board.ts';
import { applyBargainCommand, refreshHeroes } from './bargains.ts';
import type { TickContext } from './context.ts';
import { spawnEnemy } from './enemies.ts';
import { commandHero, spawnHero } from './heroes/index.ts';
import { applySummon, sendWave } from './master.ts';
import { callWave, startWave } from './waves.ts';

const ABILITY_SLOTS = 4;

/** Walk a hero to (x, y). */
interface MoveCommand {
  readonly kind: 'move';
  readonly hero: number;
  readonly x: number;
  readonly y: number;
}

interface StopCommand {
  readonly kind: 'stop';
  readonly hero: number;
}

/** Hold fire on/off. */
interface HoldCommand {
  readonly kind: 'hold';
  readonly hero: number;
  readonly on: boolean;
}

/** Cast ability `slot` (0-3; 3 = ultimate; toggles such as Brace are abilities). `x`/`y` go together. */
interface AbilityCommand {
  readonly kind: 'ability';
  readonly hero: number;
  readonly slot: number;
  readonly x?: number;
  readonly y?: number;
  readonly target?: number;
}

interface AutocastCommand {
  readonly kind: 'autocast';
  readonly hero: number;
  readonly slot: number;
  readonly on: boolean;
}

/**
 * Solo play: starts the next wave now instead of waiting for the clock (a no-op when waves are
 * exhausted, or in master mode with nothing pending). Seat-less: not addressed to a hero.
 */
interface CallWaveCommand {
  readonly kind: 'callWave';
}

/** DEBUG (tests, scenarios): spawn a unit of content `def` at (x, y). Enemies spawn idle. Not a player action. */
interface SpawnCommand {
  readonly kind: 'spawn';
  readonly def: string;
  readonly x: number;
  readonly y: number;
}

/**
 * Intents board ops (src/intents/board.ts). `hero` is the acting hero: the poster of a `post`, the
 * reserver of a `reserve`, whoever cancels a `cancel`. `intentKind` labels the intent (a name
 * that cannot clash with the command's own `kind`); `fireIn` and `offset` are whole ticks.
 */
export type IntentCommand =
  | {
      readonly kind: 'intent';
      readonly op: 'post';
      readonly hero: number;
      readonly slot: number;
      readonly intentKind: string;
      readonly x: number;
      readonly y: number;
      readonly fireIn: number;
    }
  | {
      readonly kind: 'intent';
      readonly op: 'reserve';
      readonly hero: number;
      readonly intent: number;
      readonly slot: number;
      readonly offset: number;
    }
  | { readonly kind: 'intent'; readonly op: 'cancel'; readonly hero: number; readonly intent: number };

/** Wave master (player 4 by convention): buy `count` units of enemy `def` into the pending wave. */
export interface SummonCommand {
  readonly kind: 'summon';
  readonly def: string;
  readonly count: number;
}

/** Wave master: start the pending wave early (see sim/master.ts). */
interface SendCommand {
  readonly kind: 'send';
}

/**
 * Resolves a bargain offer (src/sim/bargains.ts): `accept` takes card `card` (a `BargainDef.id` on
 * the offer), `decline` refuses them all. The first valid resolution of an offer wins; an unknown
 * offer or card, or an offer already resolved, is a logged no-op. No ownership check until wave 10.
 */
export type BargainCommand =
  | { readonly kind: 'bargain'; readonly op: 'accept'; readonly offer: number; readonly card: string }
  | { readonly kind: 'bargain'; readonly op: 'decline'; readonly offer: number };

/** The commands that address one hero. */
export type HeroCommand = MoveCommand | StopCommand | HoldCommand | AbilityCommand | AutocastCommand;

export type Command =
  | HeroCommand
  | IntentCommand
  | BargainCommand
  | SummonCommand
  | SendCommand
  | CallWaveCommand
  | SpawnCommand;

function isId(n: unknown): boolean {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

function isSlot(n: unknown): boolean {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n < ABILITY_SLOTS;
}

function isCoord(n: unknown): boolean {
  return typeof n === 'number' && Number.isFinite(n);
}

const MAX_SUMMON = 1000;
const MAX_TICKS = 1_000_000;

function isTicks(n: unknown, min: number): boolean {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= min && n <= MAX_TICKS;
}

function isIntentShape(cmd: IntentCommand): boolean {
  if (!isId(cmd.hero)) {
    return false;
  }
  switch (cmd.op) {
    case 'post':
      return (
        isSlot(cmd.slot) &&
        typeof cmd.intentKind === 'string' &&
        cmd.intentKind.length > 0 &&
        isCoord(cmd.x) &&
        isCoord(cmd.y) &&
        isTicks(cmd.fireIn, 1)
      );
    case 'reserve':
      return isId(cmd.intent) && isSlot(cmd.slot) && isTicks(cmd.offset, 0);
    case 'cancel':
      return isId(cmd.intent);
    default:
      return false;
  }
}

/** Longest accepted bargain id in a command (the logged command stays small). */
const MAX_CARD_ID = 64;

function isBargainShape(cmd: BargainCommand): boolean {
  switch (cmd.op) {
    case 'accept':
      return isId(cmd.offer) && typeof cmd.card === 'string' && cmd.card.length > 0 && cmd.card.length <= MAX_CARD_ID;
    case 'decline':
      return isId(cmd.offer);
    default:
      return false;
  }
}

function isAbilityShape(cmd: AbilityCommand): boolean {
  const hasX = cmd.x !== undefined;
  const hasY = cmd.y !== undefined;
  return (
    isSlot(cmd.slot) &&
    hasX === hasY &&
    (!hasX || (isCoord(cmd.x) && isCoord(cmd.y))) &&
    (cmd.target === undefined || isId(cmd.target))
  );
}

/** Shape check at submission, so bad input never reaches the queue. Depends only on the command. */
export function isValidCommand(cmd: Command): boolean {
  switch (cmd.kind) {
    case 'move':
      return isId(cmd.hero) && isCoord(cmd.x) && isCoord(cmd.y);
    case 'stop':
      return isId(cmd.hero);
    case 'hold':
      return isId(cmd.hero) && typeof cmd.on === 'boolean';
    case 'ability':
      return isId(cmd.hero) && isAbilityShape(cmd);
    case 'autocast':
      return isId(cmd.hero) && isSlot(cmd.slot) && typeof cmd.on === 'boolean';
    case 'intent':
      return isIntentShape(cmd);
    case 'bargain':
      return isBargainShape(cmd);
    case 'summon':
      return (
        typeof cmd.def === 'string' &&
        cmd.def.length > 0 &&
        typeof cmd.count === 'number' &&
        Number.isSafeInteger(cmd.count) &&
        cmd.count >= 1 &&
        cmd.count <= MAX_SUMMON
      );
    case 'send':
    case 'callWave':
      return true;
    case 'spawn':
      return typeof cmd.def === 'string' && cmd.def.length > 0 && isCoord(cmd.x) && isCoord(cmd.y);
    default:
      return false;
  }
}

function canonicalAbility(cmd: AbilityCommand): Command {
  const out: {
    kind: 'ability';
    hero: number;
    slot: number;
    x?: number;
    y?: number;
    target?: number;
  } = { kind: 'ability', hero: cmd.hero + 0, slot: cmd.slot + 0 };
  if (cmd.x !== undefined && cmd.y !== undefined) {
    out.x = cmd.x + 0;
    out.y = cmd.y + 0;
  }
  if (cmd.target !== undefined) {
    out.target = cmd.target + 0;
  }
  return out;
}

function canonicalIntent(cmd: IntentCommand): Command {
  switch (cmd.op) {
    case 'post':
      return {
        kind: 'intent',
        op: 'post',
        hero: cmd.hero + 0,
        slot: cmd.slot + 0,
        intentKind: cmd.intentKind,
        x: cmd.x + 0,
        y: cmd.y + 0,
        fireIn: cmd.fireIn + 0,
      };
    case 'reserve':
      return {
        kind: 'intent',
        op: 'reserve',
        hero: cmd.hero + 0,
        intent: cmd.intent + 0,
        slot: cmd.slot + 0,
        offset: cmd.offset + 0,
      };
    default:
      return { kind: 'intent', op: 'cancel', hero: cmd.hero + 0, intent: cmd.intent + 0 };
  }
}

/**
 * Own copy of `cmd` with -0 turned into 0 in every numeric field. JSON writes -0 as "0", so a
 * logged or networked command would otherwise replay as a different float than the one that ran
 * (the state hash compares exact bits). This is the one place that makes commands wire-safe.
 */
export function canonicalCommand(cmd: Command): Command {
  switch (cmd.kind) {
    case 'move':
      return { kind: 'move', hero: cmd.hero + 0, x: cmd.x + 0, y: cmd.y + 0 };
    case 'stop':
      return { kind: 'stop', hero: cmd.hero + 0 };
    case 'hold':
      return { kind: 'hold', hero: cmd.hero + 0, on: cmd.on };
    case 'ability':
      return canonicalAbility(cmd);
    case 'autocast':
      return { kind: 'autocast', hero: cmd.hero + 0, slot: cmd.slot + 0, on: cmd.on };
    case 'intent':
      return canonicalIntent(cmd);
    case 'bargain':
      return cmd.op === 'accept'
        ? { kind: 'bargain', op: 'accept', offer: cmd.offer + 0, card: cmd.card }
        : { kind: 'bargain', op: 'decline', offer: cmd.offer + 0 };
    case 'summon':
      return { kind: 'summon', def: cmd.def, count: cmd.count + 0 };
    case 'send':
      return { kind: 'send' };
    case 'callWave':
      return { kind: 'callWave' };
    case 'spawn':
      return { kind: 'spawn', def: cmd.def, x: cmd.x + 0, y: cmd.y + 0 };
    default: {
      const unknown: never = cmd;
      throw new Error(`unhandled command ${JSON.stringify(unknown)}`);
    }
  }
}

function applySpawn(ctx: TickContext, cmd: SpawnCommand): void {
  const enemy = findById(ctx.game.enemies, cmd.def);
  if (enemy !== undefined) {
    spawnEnemy(ctx, enemy, cmd, 'idle');
    return;
  }
  const hero = findById(ctx.game.heroes, cmd.def);
  if (hero !== undefined) {
    spawnHero(ctx, hero, cmd.x, cmd.y);
    // The new hero starts from its effective def (accepted bargains may patch maxHp, armour, speed).
    refreshHeroes(ctx);
  }
}

/** Applies one command. Commands that target missing entities are no-ops (still logged as `cmd`). */
export function applyCommand(ctx: TickContext, cmd: Command): void {
  if (cmd.kind === 'spawn') {
    applySpawn(ctx, cmd);
    return;
  }
  if (cmd.kind === 'intent') {
    applyIntentCommand(ctx, cmd);
    return;
  }
  if (cmd.kind === 'bargain') {
    applyBargainCommand(ctx, cmd);
    return;
  }
  if (cmd.kind === 'summon') {
    applySummon(ctx, cmd);
    return;
  }
  if (cmd.kind === 'send') {
    const wave = sendWave(ctx);
    if (wave !== undefined) {
      startWave(ctx, wave);
    }
    return;
  }
  if (cmd.kind === 'callWave') {
    callWave(ctx);
    return;
  }
  const hero = ctx.entities.get(cmd.hero);
  if (hero?.kind === 'hero') {
    commandHero(ctx, hero, cmd);
  }
}
