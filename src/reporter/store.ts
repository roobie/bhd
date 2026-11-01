// The log store: where run logs live, the keys that name them, gzip I/O and log reuse.
// Layout (DESIGN "Output"): `<outDir>/<side>/<lineup>-<seed>.ndjson.gz` and `<outDir>/timing.json`.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { gunzipSync, gzipSync } from 'node:zlib';
import type { GameSpec } from '../match/run.ts';
import { decodeLog } from '../replay/log.ts';
import type { SimEvent } from '../sim/events.ts';
import type { GameLog, LogMeta, ResolvedSide, Scenario, Timing } from './types.ts';

/** JSON with object keys sorted, so equal values always give equal text. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Run key of one game: the code identity plus everything that determines it (overrides live in the spec). */
export function runKey(fingerprint: string, spec: GameSpec): string {
  return sha256(`${fingerprint}\n${stableStringify(spec)}`).slice(0, 16);
}

/** Key of a whole batch (names `.bhd/runs/<key>`): the scenario and the identity of both sides. */
export function batchKey(scenario: Scenario, base: ResolvedSide, cand: ResolvedSide): string {
  const side = (s: ResolvedSide): unknown => ({ fingerprint: s.fingerprint, overrides: s.overrides ?? null });
  return sha256(stableStringify({ scenario, base: side(base), cand: side(cand) })).slice(0, 16);
}

/** Path of one game's log. */
export function logPath(outDir: string, side: 'base' | 'cand', lineup: number, seed: number): string {
  return join(outDir, side, `${lineup}-${seed}.ndjson.gz`);
}

/** Digest of a game's `hash` events: equal digests mean the same game. */
export function hashDigest(events: readonly SimEvent[]): string {
  const h = createHash('sha256');
  for (const e of events) {
    if (e.kind === 'hash') {
      h.update(`${e.tick}:${e.stateHash}\n`);
    }
  }
  return h.digest('hex').slice(0, 16);
}

/** Writes `data` through a temp file and a rename, so a reader never sees half a file. */
function writeAtomic(path: string, data: string | Uint8Array): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

/** Gzips the log text to `path`. The bytes depend on the text only. */
export function writeLogFile(path: string, text: string): void {
  writeAtomic(path, gzipSync(text));
}

/** Reads and decodes a `.ndjson.gz` log. */
export function readLogFile(path: string): GameLog {
  return decodeLog(gunzipSync(readFileSync(path)).toString('utf8'));
}

/**
 * The log at `path` when it is the game this job would produce (same run key and same side
 * identity), else undefined. A log that is unreadable counts as missing.
 */
export function reusableLog(path: string, spec: GameSpec, meta: LogMeta): GameLog | undefined {
  if (!existsSync(path)) {
    return undefined;
  }
  try {
    const log = readLogFile(path);
    const h = log.header;
    const same =
      h.side === meta.side &&
      h.ref === meta.ref &&
      h.sha === meta.sha &&
      h.dirty === meta.dirty &&
      h.fingerprint === meta.fingerprint &&
      runKey(h.fingerprint, h.spec) === runKey(meta.fingerprint, spec);
    return same ? log : undefined;
  } catch {
    return undefined;
  }
}

export function writeTiming(outDir: string, timing: Timing): void {
  writeAtomic(join(outDir, 'timing.json'), `${JSON.stringify(timing, null, 2)}\n`);
}
