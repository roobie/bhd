// Event stream (project DESIGN.md §6.6): the source of truth for the reporter and replays.
// Every event is `{tick, kind, ...}`. Wave 1 kinds are all defined here; `combo`, `intent` and
// `choice` arrive in waves 2-3. Field names are part of the stored log format: add, don't rename.

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

/** `killer` is the entity id that took it to 0 hp, 0 if unknown. */
interface DeathEvent extends EventBase {
  readonly kind: 'death';
  readonly id: number;
  readonly killer: number;
}

/** An enemy reached the Ancient; `livesLost` is the Ancient hp it cost. */
interface LeakEvent extends EventBase {
  readonly kind: 'leak';
  readonly id: number;
  readonly livesLost: number;
}

export type EndReason = 'ancient-destroyed' | 'victory';

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

export type SimEvent =
  | CmdEvent
  | WaveEvent
  | SpawnEvent
  | DmgEvent
  | HealEvent
  | StatusEvent
  | AbilityEvent
  | ResourceEvent
  | DeathEvent
  | LeakEvent
  | EndEvent
  | HashEvent;
