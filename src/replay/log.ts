// The game log codec: one header line plus one line per SimEvent, as NDJSON (format spec in
// docs/EVENTS.md). Pure text in, pure text out: compression, files and wall time are the
// reporter's business, so the same game always encodes to the same bytes.

import type { RunConfig } from '../content/overrides.ts';
import type { GameEnd, GameSpec } from '../match/run.ts';
import type { SimEvent } from '../sim/events.ts';

const LOG_FORMAT = 'bhd-log';
const LOG_VERSION = 1;

/** Line 1 of a log. */
export interface LogHeader {
  readonly format: typeof LOG_FORMAT;
  readonly v: typeof LOG_VERSION;
  /** `RUN_ABI` of the code that ran the game. */
  readonly abi: number;
  /** Which side of a comparison produced it (`base`, `cand`, or a free label for `bhd run`). */
  readonly side: string;
  /** The ref as the user named it (`main`, `WORKTREE`...). */
  readonly ref: string;
  /** Commit sha the code came from. */
  readonly sha: string;
  /** True when the code was a worktree with uncommitted changes. */
  readonly dirty: boolean;
  /** SHA-256 of the sorted sources in the pure dirs: two logs with equal fingerprints ran the same code. */
  readonly fingerprint: string;
  readonly spec: GameSpec;
  /** The config after overrides: metrics read max hp and slots from here without that ref's code. */
  readonly resolved: RunConfig;
  readonly end: GameEnd;
  readonly ticks: number;
}

export interface DecodedLog {
  readonly header: LogHeader;
  readonly events: SimEvent[];
}

/** JSON.stringify replacer: refuses NaN and infinities (JSON would write them as null). */
function finiteOnly(key: string, value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new RangeError(`log: non-finite number ${value} at '${key}'`);
  }
  return value;
}

/**
 * The log text: header line, then each event, every line ending in `\n`. Keys keep their insertion
 * order. A `-0` is written as `0` (JSON has no negative zero; `cmd` events are canonical already, so
 * this never changes a command). Throws on any non-finite number.
 */
export function encodeLog(header: LogHeader, events: readonly SimEvent[]): string {
  const lines: string[] = [JSON.stringify(header, finiteOnly)];
  for (const e of events) {
    lines.push(JSON.stringify(e, finiteOnly));
  }
  return `${lines.join('\n')}\n`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseLine(line: string, n: number): unknown {
  try {
    return JSON.parse(line);
  } catch (error) {
    throw new SyntaxError(`log: line ${n} is not JSON`, { cause: error });
  }
}

/** Parses `encodeLog` output. Throws on a missing or foreign header or a line that is not an event. */
export function decodeLog(text: string): DecodedLog {
  const lines = text.split('\n');
  if (lines.at(-1) === '') {
    lines.pop();
  }
  const header = parseLine(lines[0] ?? '', 1);
  if (!isRecord(header) || header.format !== LOG_FORMAT) {
    throw new TypeError('log: line 1 is not a bhd-log header');
  }
  if (header.v !== LOG_VERSION) {
    throw new RangeError(`log: unsupported version ${String(header.v)}`);
  }
  const events: SimEvent[] = [];
  for (let i = 1; i < lines.length; i++) {
    const e = parseLine(lines[i] ?? '', i + 1);
    if (!(isRecord(e) && typeof e.tick === 'number' && typeof e.kind === 'string')) {
      throw new TypeError(`log: line ${i + 1} is not an event`);
    }
    events.push(e as unknown as SimEvent);
  }
  return { header: header as unknown as LogHeader, events };
}
