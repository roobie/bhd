// Event stream (project DESIGN.md §6.6): the source of truth for the reporter and replays.
// Every event is `{tick, kind, ...}`. Wave 1 kinds, `intent` (emitted by the sim) and `choice`
// (emitted by `Match`, never by the sim) are defined here; `combo` arrives later. Field names are
// part of the stored log format: add, don't rename.

import type { Command } from './commands.ts';
import type { Team } from './entities.ts';

interface EventBase {
  readonly tick: number;
}

/** A command applied at the start of `tick`, exactly as submitted. */
interface CmdEvent extends EventBase {
  readonly kind: 'cmd';
  readonly player: number;
  readonly cmd: Command;
}

interface WaveComposition {
  readonly def: string;
  readonly count: number;
}

/** `n` is the 1-based wave number. */
interface WaveEvent extends EventBase {
  readonly kind: 'wave';
  readonly n: number;
  readonly phase: 'start' | 'end';
  readonly composition: readonly WaveComposition[];
}

interface SpawnEvent extends EventBase {
  readonly kind: 'spawn';
  readonly id: number;
  readonly def: string;
  readonly team: Team;
}

/** `tags` e.g. `ff`, `overpen`, `pierce`, `splash`, `ability:<id>`. */
interface DmgEvent extends EventBase {
  readonly kind: 'dmg';
  readonly src: number;
  readonly dst: number;
  readonly amount: number;
  readonly tags: readonly string[];
}

/** `amount` is what was actually restored (capped at maxHp). */
interface HealEvent extends EventBase {
  readonly kind: 'heal';
  readonly src: number;
  readonly dst: number;
  readonly amount: number;
}

interface StatusEvent extends EventBase {
  readonly kind: 'status';
  readonly dst: number;
  readonly status: string;
  readonly on: boolean;
  readonly src: number;
}

/** `target` is an entity id, 0 for none. `value` is filled when known (else 0). */
interface AbilityEvent extends EventBase {
  readonly kind: 'ability';
  readonly hero: number;
  readonly slot: number;
  readonly target: number;
  readonly value: number;
}

/** Emitted on band crossings only (e.g. heat 60/85/100). */
interface ResourceEvent extends EventBase {
  readonly kind: 'resource';
  readonly hero: number;
  readonly resource: string;
  readonly band: number;
}

/**
 * The Psyker's Discharge backlash fired (sim/heroes/psyker.ts): `warp` is his Warp when it was
 * rolled, `damage` the per-target hit (`60 + warp`, tagged `ff` `splash`; the `dmg` events follow).
 */
interface BacklashEvent extends EventBase {
  readonly kind: 'backlash';
  readonly hero: number;
  readonly warp: number;
  readonly damage: number;
}

/**
 * `killer` is the entity id that took it to 0 hp, 0 if unknown. A hero is not removed: it stays
 * downed (hp 0) until a `respawn` event; a `death` is emitted once per down.
 */
interface DeathEvent extends EventBase {
  readonly kind: 'death';
  readonly id: number;
  readonly killer: number;
}

/** A downed hero revived at its spawn point with full hp (sim/respawn.ts). `id` is the hero's entity id. */
interface RespawnEvent extends EventBase {
  readonly kind: 'respawn';
  readonly id: number;
}

/** An enemy reached the Ancient; `livesLost` is the Ancient hp it cost. */
interface LeakEvent extends EventBase {
  readonly kind: 'leak';
  readonly id: number;
  readonly livesLost: number;
}

export type EndReason = 'ancient-destroyed' | 'victory' | 'team-wiped';

/** The game is over: gameplay stops (see Sim). `wave` is the number of waves started. */
interface EndEvent extends EventBase {
  readonly kind: 'end';
  readonly wave: number;
  readonly reason: EndReason;
}

/** State hash after `tick` completed; see `Sim.hash`. */
interface HashEvent extends EventBase {
  readonly kind: 'hash';
  readonly stateHash: string;
}

type IntentOp = 'post' | 'reserve' | 'fire' | 'fulfil' | 'expire' | 'cancel';

/**
 * Intents board lifecycle (src/intents/board.ts). `by` is the hero the op concerns: the poster for
 * post / fire / cancel-by-poster, the reserver for reserve / fulfil / expire-of-a-reservation.
 * `intentKind` is the intent's kind label (named so it does not clash with the `kind` discriminator).
 */
interface IntentEvent extends EventBase {
  readonly kind: 'intent';
  readonly id: number;
  readonly op: IntentOp;
  readonly by: number;
  readonly intentKind: string;
}

type BargainOp = 'offer' | 'accept' | 'decline' | 'expire' | 'end';

/**
 * Bargain lifecycle (src/sim/bargains.ts). `offer` is the offer id. Per op:
 * - `offer`: an offer opened after wave `wave`; `cards` are the `BargainDef.id`s on it, `until` the tick it lapses.
 * - `accept`: `card` taken; `hero` is the entity id of the hero it benefits (0 for a team card).
 * - `decline`: refused by command (`card` and `hero` absent).
 * - `expire`: the window lapsed unresolved (counts as a decline).
 * - `end`: the offer is closed (follows every accept, decline and expire).
 * Fields are added, never renamed; fields not listed for an op are absent.
 */
interface BargainEvent extends EventBase {
  readonly kind: 'bargain';
  readonly offer: number;
  readonly op: BargainOp;
  readonly wave?: number;
  readonly cards?: readonly string[];
  readonly until?: number;
  readonly card?: string;
  readonly hero?: number;
}

interface ChoiceOption {
  readonly id: string;
  readonly score: number;
}

/**
 * A bot decision between >= 2 options, emitted by `Match` (not the sim) when first evaluated and
 * whenever its pick changes. `options` are in the decision's fixed order, `picked` is one of their ids.
 */
interface ChoiceEvent extends EventBase {
  readonly kind: 'choice';
  readonly hero: number;
  readonly decision: string;
  readonly options: readonly ChoiceOption[];
  readonly picked: string;
}

/**
 * A prop (Pavise) stopped something: an enemy's single-target hit (`src` the enemy, `dst` the unit it
 * aimed at) or the Gunner's overpenetrating line (`src` the Gunner, `dst` the first unit behind the
 * prop that the line would have hit, absent if none). `prop` is the prop's entity id.
 */
interface BlockEvent extends EventBase {
  readonly kind: 'block';
  readonly src: number;
  readonly dst?: number;
  readonly prop: number;
}

/** A prop's lifetime ended and it was removed; `id` is the prop's entity id (its `spawn` event named it). */
interface DespawnEvent extends EventBase {
  readonly kind: 'despawn';
  readonly id: number;
}

export type SimEvent =
  | CmdEvent
  | WaveEvent
  | SpawnEvent
  | DmgEvent
  | HealEvent
  | StatusEvent
  | AbilityEvent
  | ResourceEvent
  | BacklashEvent
  | DeathEvent
  | RespawnEvent
  | LeakEvent
  | EndEvent
  | HashEvent
  | IntentEvent
  | ChoiceEvent
  | BlockEvent
  | DespawnEvent
  | BargainEvent;
