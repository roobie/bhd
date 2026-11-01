// Replay mode of the viewer: a `#log=<url>&tick=T` link rebuilds the logged game from its header and
// checks the live state hashes against the log's. No DOM here; app.ts owns the stepping and the banner.

import type { GameSpec } from '../match/run.ts';
import type { DecodedLog } from '../replay/log.ts';
import { decodeLog } from '../replay/log.ts';
import type { Checkpoint, Verdict } from '../replay/verify.ts';
import { checkpoints, verifyHashes } from '../replay/verify.ts';
import type { SimEvent } from '../sim/events.ts';
import { TICK_HZ } from '../sim/time.ts';

/** The viewer opens this many ticks (2 s) before the requested tick, so the moment can be watched. */
const REPLAY_LEAD_TICKS = 2 * TICK_HZ;
const SHA_SHOWN = 7;

export interface Replay {
  readonly kind: 'ready';
  readonly log: DecodedLog;
  readonly spec: GameSpec;
  readonly logged: readonly Checkpoint[];
  /** Live checkpoints seen so far; reset with the game. */
  live: Checkpoint[];
  verdict: Verdict;
}

export type ReplayState = { readonly kind: 'loading' } | { readonly kind: 'failed'; readonly message: string } | Replay;

/** The tick to fast-forward to for a requested tick (0: nothing to skip). */
export function fastForwardTarget(tick: number | undefined): number {
  return tick === undefined ? 0 : Math.max(0, tick - REPLAY_LEAD_TICKS);
}

function replayOf(log: DecodedLog): Replay {
  return {
    kind: 'ready',
    log,
    spec: log.header.spec,
    logged: checkpoints(log.events),
    live: [],
    verdict: { ok: true, checked: 0, through: 0 },
  };
}

/** Fetches and decodes a log. Throws with a readable message when it cannot. */
export async function loadReplay(url: string): Promise<Replay> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return replayOf(decodeLog(await res.text()));
}

/** Restarts verification (the game was rebuilt). */
export function restartReplay(r: Replay): void {
  r.live = [];
  r.verdict = { ok: true, checked: 0, through: 0 };
}

/** Folds the events of one live step into the verification. A divergence, once found, stays. */
export function recordLive(r: Replay, events: readonly SimEvent[]): void {
  if (!r.verdict.ok) {
    return;
  }
  // Checkpoints past the log's last tick have nothing to compare with: not a divergence.
  const fresh = checkpoints(events).filter((c) => c.tick <= r.log.header.ticks);
  if (fresh.length === 0) {
    return;
  }
  r.live.push(...fresh);
  r.verdict = verifyHashes(r.logged, r.live);
}

function shortSha(log: DecodedLog): string {
  const { sha, dirty } = log.header;
  return `${sha.slice(0, SHA_SHOWN)}${dirty ? '+dirty' : ''}`;
}

export interface Banner {
  readonly text: string;
  /** `ok`, `bad` or `wait`, for styling. */
  readonly tone: 'ok' | 'bad' | 'wait';
}

export function bannerOf(state: ReplayState): Banner {
  if (state.kind === 'loading') {
    return { text: 'loading replay log…', tone: 'wait' };
  }
  if (state.kind === 'failed') {
    return { text: `replay failed: ${state.message}`, tone: 'bad' };
  }
  const v = state.verdict;
  if (!v.ok) {
    return { text: `diverged at tick ${v.tick} (log ${shortSha(state.log)})`, tone: 'bad' };
  }
  return {
    text: `replay verified (log ${shortSha(state.log)}) · ${v.checked} checkpoints, through tick ${v.through}`,
    tone: 'ok',
  };
}
