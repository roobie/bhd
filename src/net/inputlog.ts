// The sealed-input log of a networked game (wave 10). A peer records everything it applied: the
// spec, the seats, the delay, every seal in order, its own hash checkpoints and the `cmd` events it
// saw. `replayInputs` plays the seals into a fresh Match, which is the reference any peer must equal;
// the NDJSON dump is what a desync leaves behind for `bhd desync`. Pure: text in, text out.

import type { GameSpec } from '../match/run.ts';
import { buildMatch } from '../match/run.ts';
import type { Command } from '../sim/commands.ts';
import { canonicalCommand, isValidCommand } from '../sim/commands.ts';
import type { SimEvent } from '../sim/events.ts';
import type { PeerId, Seal, SeatAssignment } from './types.ts';
import { validateMsg } from './types.ts';

const LOG_FORMAT = 'bhd-inputlog';
const LOG_VERSION = 1;

export interface ReplayOptions {
  /** Overrides `spec.hashEvery` (state is unaffected; only the `hash` events change). */
  readonly hashEvery?: number;
}

/**
 * Replays `seals` into a fresh Match built from `spec`, submitting each tick's inputs per rule R1
 * (`sim.command(player, cmd, tick)` in seal order, then one step); returns every event. Seals must
 * start at tick 1 and be contiguous; the replay stops at the first gap.
 */
export function replayInputs(spec: GameSpec, seals: readonly Seal[], options: ReplayOptions = {}): SimEvent[] {
  const match = buildMatch(options.hashEvery === undefined ? spec : { ...spec, hashEvery: options.hashEvery });
  const events: SimEvent[] = [];
  for (const seal of seals) {
    if (seal.tick !== match.tick + 1) {
      break;
    }
    for (const input of seal.inputs) {
      match.sim.command(input.player, input.cmd, seal.tick);
    }
    events.push(...match.step());
  }
  return events;
}

/** A state hash this peer computed after `tick`. */
interface LoggedHash {
  readonly tick: number;
  readonly hash: string;
}

/** A `cmd` event this peer saw (humans', system's and bots' alike). */
export interface LoggedCmd {
  readonly tick: number;
  readonly player: number;
  readonly cmd: Command;
}

export interface InputLogHeader {
  readonly spec: GameSpec;
  readonly seats: readonly SeatAssignment[];
  readonly delay: number;
  /** The peer that wrote the log. */
  readonly peer: PeerId;
}

export interface InputLog {
  readonly header: InputLogHeader;
  /** The seals this peer applied, in tick order. */
  readonly seals: readonly Seal[];
  /** This peer's checkpoints (every 30 ticks in play). */
  readonly hashes: readonly LoggedHash[];
  /** Every `cmd` event the peer's sim logged. */
  readonly cmds: readonly LoggedCmd[];
}

/** Accumulates a peer's log as the game runs. */
export interface InputRecorder {
  seal: (seal: Seal) => void;
  hash: (tick: number, hash: string) => void;
  /** Feeds a step's events: records the `cmd` ones. */
  events: (events: readonly SimEvent[]) => void;
  snapshot: () => InputLog;
}

export function createRecorder(header: InputLogHeader): InputRecorder {
  const seals: Seal[] = [];
  const hashes: LoggedHash[] = [];
  const cmds: LoggedCmd[] = [];
  return {
    seal: (seal) => {
      seals.push(seal);
    },
    hash: (tick, hash) => {
      hashes.push({ tick, hash });
    },
    events: (events) => {
      for (const e of events) {
        if (e.kind === 'cmd') {
          cmds.push({ tick: e.tick, player: e.player, cmd: e.cmd });
        }
      }
    },
    snapshot: () => ({ header, seals: [...seals], hashes: [...hashes], cmds: [...cmds] }),
  };
}

// ---------------------------------------------------------------------------------------------
// NDJSON dump: a header line, then one line per seal, hash and cmd (tagged by `k`).
// ---------------------------------------------------------------------------------------------

/** Text form of a log; every line ends in `\n`. */
export function encodeInputLog(log: InputLog): string {
  const lines: string[] = [
    JSON.stringify({ format: LOG_FORMAT, v: LOG_VERSION, ...log.header }),
    ...log.seals.map((s) => JSON.stringify({ k: 'seal', tick: s.tick, inputs: s.inputs })),
    ...log.hashes.map((h) => JSON.stringify({ k: 'hash', tick: h.tick, hash: h.hash })),
    ...log.cmds.map((c) => JSON.stringify({ k: 'cmd', tick: c.tick, player: c.player, cmd: c.cmd })),
  ];
  return `${lines.join('\n')}\n`;
}

export type DecodeLogResult =
  | { readonly ok: true; readonly log: InputLog }
  | { readonly ok: false; readonly reason: string };

const bad = (reason: string): DecodeLogResult => ({ ok: false, reason });

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isTick(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

function parseLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
}

function readHeader(raw: unknown): InputLogHeader | string {
  if (!isRecord(raw) || raw.format !== LOG_FORMAT || raw.v !== LOG_VERSION) {
    return 'not a bhd input log';
  }
  // The header's spec, seats and delay are exactly a `start` message: reuse its validation.
  const start = validateMsg({ t: 'start', spec: raw.spec, seats: raw.seats, delay: raw.delay });
  if (!(start.ok && start.msg.t === 'start') || typeof raw.peer !== 'string') {
    return 'bad header';
  }
  return { spec: start.msg.spec, seats: start.msg.seats, delay: start.msg.delay, peer: raw.peer };
}

interface Parts {
  readonly seals: Seal[];
  readonly hashes: LoggedHash[];
  readonly cmds: LoggedCmd[];
}

/** Files one record line into `into`; returns why it is bad, or undefined. */
function readRecord(raw: unknown, into: Parts): string | undefined {
  if (!(isRecord(raw) && isTick(raw.tick))) {
    return 'not a record';
  }
  const { k, tick } = raw;
  if (k === 'seal') {
    const m = validateMsg({ t: 'seal', tick, inputs: raw.inputs });
    if (!(m.ok && m.msg.t === 'seal')) {
      return 'bad seal';
    }
    into.seals.push({ tick: m.msg.tick, inputs: m.msg.inputs });
  } else if (k === 'hash' && typeof raw.hash === 'string') {
    into.hashes.push({ tick, hash: raw.hash });
  } else if (k === 'cmd' && isTick(raw.player) && isRecord(raw.cmd) && isValidCommand(raw.cmd as unknown as Command)) {
    into.cmds.push({ tick, player: raw.player, cmd: canonicalCommand(raw.cmd as unknown as Command) });
  } else {
    return 'unknown record';
  }
  return undefined;
}

/** Parses a dump. Never throws; anything malformed is a refusal with the reason and line number. */
export function decodeInputLog(text: string): DecodeLogResult {
  const [first, ...rest] = text.split('\n').filter((l) => l.length > 0);
  if (first === undefined) {
    return bad('empty');
  }
  const header = readHeader(parseLine(first));
  if (typeof header === 'string') {
    return bad(header);
  }
  const parts: Parts = { seals: [], hashes: [], cmds: [] };
  for (const [i, line] of rest.entries()) {
    const why = readRecord(parseLine(line), parts);
    if (why !== undefined) {
      return bad(`line ${i + 2}: ${why}`);
    }
  }
  return { ok: true, log: { header, ...parts } };
}
