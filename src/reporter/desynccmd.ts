// `bhd desync a.ndjson b.ndjson`: replays two peers' input-log dumps and prints where they first
// diverge. Files in, text out; the analysis is src/net/desync.ts.

import { readFileSync } from 'node:fs';
import { analyzeDesync, formatDesyncReport } from '../net/desync.ts';
import type { InputLog } from '../net/inputlog.ts';
import { decodeInputLog } from '../net/inputlog.ts';

const DESYNC_USAGE = `usage: bhd desync <a.ndjson> <b.ndjson>
  Replay two peers' desync dumps (see the desync panel's download) at one hash per tick and print the first divergent tick.`;

function load(path: string): InputLog {
  const decoded = decodeInputLog(readFileSync(path, 'utf8'));
  if (!decoded.ok) {
    throw new Error(`${path}: ${decoded.reason}`);
  }
  return decoded.log;
}

/** Runs the subcommand on its arguments (after `desync`); returns the exit code. Throws on unreadable dumps. */
export function runDesync(args: readonly string[], out: (text: string) => void): number {
  const [a, b, ...rest] = args;
  if (a === undefined || b === undefined || rest.length > 0) {
    out(DESYNC_USAGE);
    return 2;
  }
  const report = analyzeDesync(load(a), load(b));
  out(formatDesyncReport(report));
  return 0;
}
