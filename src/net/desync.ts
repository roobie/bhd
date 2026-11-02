// Desync analysis (wave 10): given the dumps two peers wrote when their checkpoints disagreed, replay
// each log's sealed inputs at one hash per tick and say where things first part. Three questions:
// does a peer's own record match the replay of its seals (a stray `sim.command` or other non-R1
// influence shows up as a divergent `cmd` event and checkpoint); do the two peers have the same
// seals; do their records agree. Pure; the file reading and printing is src/reporter/desynccmd.ts.

import type { InputLog, LoggedCmd } from './inputlog.ts';
import { replayInputs } from './inputlog.ts';

/** What one dump says about itself, against the replay of its own seals. */
export interface LogCheck {
  readonly peer: string;
  readonly seals: number;
  /** Last recorded checkpoint tick that matched the replay (0 when none did). */
  readonly lastGood: number;
  /** The first recorded checkpoint that the replay of the seals does not reproduce. */
  readonly badCheckpoint?: { readonly tick: number; readonly recorded: string; readonly replayed: string | undefined };
  /** The first `cmd` event the peer logged that the replay does not have (or the reverse). */
  readonly badCmd?: {
    readonly tick: number;
    readonly recorded: LoggedCmd | undefined;
    readonly replayed: LoggedCmd | undefined;
  };
}

export interface DesyncReport {
  readonly a: LogCheck;
  readonly b: LogCheck;
  /** The dumps are of games with different specs: nothing else is comparable. */
  readonly specsDiffer: boolean;
  /** First tick whose seal differs between the dumps (over the ticks both hold). */
  readonly sealsDiverge?: number;
  /** First tick at which the two replays' state hashes differ. */
  readonly replaysDiverge?: number;
  /** First tick at which the two peers' recorded checkpoints differ. */
  readonly recordsDiverge?: number;
  /** The earliest tick any of the above points at; undefined when the dumps agree. */
  readonly firstTick?: number;
}

function hashesOf(events: ReturnType<typeof replayInputs>): Map<number, string> {
  const out = new Map<number, string>();
  for (const e of events) {
    if (e.kind === 'hash') {
      out.set(e.tick, e.stateHash);
    }
  }
  return out;
}

function cmdsOf(events: ReturnType<typeof replayInputs>): LoggedCmd[] {
  return events.flatMap((e) => (e.kind === 'cmd' ? [{ tick: e.tick, player: e.player, cmd: e.cmd }] : []));
}

const same = (x: LoggedCmd | undefined, y: LoggedCmd | undefined): boolean => JSON.stringify(x) === JSON.stringify(y);

function checkLog(log: InputLog, hashes: ReadonlyMap<number, string>, cmds: readonly LoggedCmd[]): LogCheck {
  let lastGood = 0;
  let badCheckpoint: LogCheck['badCheckpoint'];
  for (const h of log.hashes) {
    const replayed = hashes.get(h.tick);
    if (replayed === h.hash) {
      lastGood = h.tick;
    } else if (replayed !== undefined) {
      badCheckpoint = { tick: h.tick, recorded: h.hash, replayed };
      break;
    }
  }
  let badCmd: LogCheck['badCmd'];
  const n = Math.max(log.cmds.length, cmds.length);
  for (let i = 0; i < n && badCmd === undefined; i++) {
    const rec = log.cmds[i];
    const rep = cmds[i];
    if (!same(rec, rep)) {
      badCmd = {
        tick: Math.min(rec?.tick ?? Number.POSITIVE_INFINITY, rep?.tick ?? Number.POSITIVE_INFINITY),
        recorded: rec,
        replayed: rep,
      };
    }
  }
  return {
    peer: log.header.peer,
    seals: log.seals.length,
    lastGood,
    ...(badCheckpoint === undefined ? {} : { badCheckpoint }),
    ...(badCmd === undefined ? {} : { badCmd }),
  };
}

function firstSealDiff(a: InputLog, b: InputLog): number | undefined {
  const n = Math.min(a.seals.length, b.seals.length);
  for (let i = 0; i < n; i++) {
    if (JSON.stringify(a.seals[i]) !== JSON.stringify(b.seals[i])) {
      return a.seals[i]?.tick;
    }
  }
  return undefined;
}

function firstMapDiff(a: ReadonlyMap<number, string>, b: ReadonlyMap<number, string>): number | undefined {
  const ticks = [...a.keys()].filter((t) => b.has(t)).sort((x, y) => x - y);
  return ticks.find((t) => a.get(t) !== b.get(t));
}

/** Replays both dumps at `hashEvery` 1 and reports where they, and each against its own record, first diverge. */
export function analyzeDesync(a: InputLog, b: InputLog): DesyncReport {
  const specsDiffer = JSON.stringify(a.header.spec) !== JSON.stringify(b.header.spec);
  const evA = replayInputs(a.header.spec, a.seals, { hashEvery: 1 });
  const evB = specsDiffer ? [] : replayInputs(b.header.spec, b.seals, { hashEvery: 1 });
  const hashA = hashesOf(evA);
  const hashB = hashesOf(evB);
  const checkA = checkLog(a, hashA, cmdsOf(evA));
  const checkB = specsDiffer ? checkLog(b, new Map(), []) : checkLog(b, hashB, cmdsOf(evB));
  const sealsDiverge = specsDiffer ? undefined : firstSealDiff(a, b);
  const replaysDiverge = specsDiffer ? undefined : firstMapDiff(hashA, hashB);
  const recA = new Map(a.hashes.map((h) => [h.tick, h.hash] as const));
  const recB = new Map(b.hashes.map((h) => [h.tick, h.hash] as const));
  const recordsDiverge = firstMapDiff(recA, recB);
  const candidates = [
    sealsDiverge,
    replaysDiverge,
    recordsDiverge,
    checkA.badCmd?.tick,
    checkB.badCmd?.tick,
    checkA.badCheckpoint?.tick,
    checkB.badCheckpoint?.tick,
  ].filter((t): t is number => t !== undefined && Number.isFinite(t));
  return {
    a: checkA,
    b: checkB,
    specsDiffer,
    ...(sealsDiverge === undefined ? {} : { sealsDiverge }),
    ...(replaysDiverge === undefined ? {} : { replaysDiverge }),
    ...(recordsDiverge === undefined ? {} : { recordsDiverge }),
    ...(candidates.length === 0 ? {} : { firstTick: Math.min(...candidates) }),
  };
}

function describeCheck(name: string, c: LogCheck): string[] {
  const out = [`${name} (${c.peer}): ${c.seals} seals, checkpoints match the replay through tick ${c.lastGood}`];
  if (c.badCheckpoint !== undefined) {
    out.push(`  checkpoint at tick ${c.badCheckpoint.tick} differs from the replay of its own seals`);
  }
  if (c.badCmd !== undefined) {
    const side = (x: LoggedCmd | undefined): string =>
      x === undefined ? 'nothing' : `player ${x.player} ${JSON.stringify(x.cmd)}`;
    out.push(
      `  first command not explained by the seals, tick ${c.badCmd.tick}: logged ${side(c.badCmd.recorded)}, replay has ${side(c.badCmd.replayed)}`,
    );
  }
  return out;
}

/** The text `bhd desync` prints. */
export function formatDesyncReport(r: DesyncReport): string {
  const lines: string[] = [];
  if (r.specsDiffer) {
    lines.push('the dumps are of different games (specs differ)');
  }
  lines.push(...describeCheck('a', r.a), ...describeCheck('b', r.b));
  if (r.sealsDiverge !== undefined) {
    lines.push(`the peers applied different seals from tick ${r.sealsDiverge}`);
  }
  if (r.replaysDiverge !== undefined) {
    lines.push(`replays of the two seal streams first differ at tick ${r.replaysDiverge}`);
  }
  if (r.recordsDiverge !== undefined) {
    lines.push(`recorded checkpoints first differ at tick ${r.recordsDiverge}`);
  }
  lines.push(r.firstTick === undefined ? 'no divergence found' : `first divergent tick: ${r.firstTick}`);
  return lines.join('\n');
}
