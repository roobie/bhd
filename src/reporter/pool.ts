// Worker-thread pool: runs a batch of games on both sides (step 2a).
// Workers are real `node:worker_threads` threads that load `worker.ts` through Node's type
// stripping (no Vite, no build); see the runner slice STATE for the check under vitest.

import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { specOf } from './scenarios.ts';
import { logPath, readTiming, runKey, writeTiming } from './store.ts';
import type { BatchPlan, BatchResult, PoolMsg, ResolvedSide, RunDone, RunJob, RunRecord, Timing } from './types.ts';

const WORKER_URL = new URL('./worker.ts', import.meta.url);

/** Default pool size: all cores but one, which the main thread keeps. */
function defaultWorkers(): number {
  return Math.max(1, availableParallelism() - 1);
}

interface Task {
  readonly job: RunJob;
  readonly side: 'base' | 'cand';
  readonly lineup: number;
  readonly seed: number;
  readonly key: string;
}

function tasksOf(plan: BatchPlan): Task[] {
  const { scenario } = plan;
  const tasks: Task[] = [];
  const sides: ResolvedSide[] = plan.cand === undefined ? [plan.base] : [plan.base, plan.cand];
  for (const resolved of sides) {
    for (let lineup = 0; lineup < scenario.lineups.length; lineup++) {
      for (let i = 0; i < scenario.seeds.count; i++) {
        const seed = scenario.seeds.from + i;
        const spec = specOf(scenario, lineup, seed, resolved.overrides);
        tasks.push({
          side: resolved.side,
          lineup,
          seed,
          key: runKey(resolved.fingerprint, spec),
          job: {
            type: 'run',
            id: tasks.length,
            root: resolved.root,
            spec,
            meta: {
              side: resolved.side,
              ref: resolved.ref,
              sha: resolved.sha,
              dirty: resolved.dirty,
              fingerprint: resolved.fingerprint,
            },
            outPath: logPath(plan.outDir, resolved.side, lineup, seed),
          },
        });
      }
    }
  }
  return tasks;
}

/** Hands `tasks` to `size` workers, one at a time each; resolves with the replies by job id. */
function runTasks(tasks: readonly Task[], size: number, onDone: (done: number) => void): Promise<Map<number, RunDone>> {
  return new Promise((resolve, reject) => {
    const replies = new Map<number, RunDone>();
    const workers: Worker[] = [];
    let next = 0;
    let failed = false;
    const inFlight = new Map<Worker, number>();
    const fail = (error: Error): void => {
      if (!failed) {
        failed = true;
        for (const w of workers) {
          w.terminate().catch(() => undefined);
        }
        reject(error);
      }
    };
    const feed = (w: Worker): void => {
      const task = tasks[next];
      if (task === undefined) {
        w.terminate().catch(() => undefined);
        return;
      }
      next += 1;
      inFlight.set(w, task.job.id);
      w.postMessage(task.job satisfies PoolMsg);
    };
    for (let i = 0; i < size; i++) {
      const w = new Worker(WORKER_URL);
      workers.push(w);
      w.on('error', fail);
      w.on('exit', (code) => {
        // A worker that ends with a job in flight would never reply: fail instead of hanging.
        const job = inFlight.get(w);
        if (job !== undefined) {
          fail(new Error(`worker exited (code ${code}) while running game ${job}`));
        }
      });
      w.on('message', (msg: PoolMsg) => {
        inFlight.delete(w);
        if (msg.type === 'error') {
          fail(new Error(`game ${msg.id} failed: ${msg.message}`));
        } else if (msg.type === 'done') {
          replies.set(msg.id, msg);
          onDone(replies.size);
          if (replies.size === tasks.length) {
            resolve(replies);
          }
          feed(w);
        }
      });
      feed(w);
    }
    if (tasks.length === 0) {
      resolve(replies);
    }
  });
}

function timingOf(replies: readonly RunDone[]): Timing['base'] {
  const ran = replies.filter((r) => r.cached !== true);
  const total = ran.reduce((sum, r) => sum + r.ms, 0);
  return { games: ran.length, msPerGame: ran.length === 0 ? 0 : total / ran.length };
}

/**
 * A side that played no game this time (all logs reused) keeps the timing an earlier run measured,
 * so a cached rerun never overwrites `timing.json` with zeros.
 */
function mergeTiming(old: Timing | undefined, fresh: Timing): { timing: Timing; changed: boolean } {
  const pick = (side: 'base' | 'cand'): Timing['base'] =>
    fresh[side].games > 0 || old === undefined ? fresh[side] : old[side];
  const timing: Timing = { base: pick('base'), cand: pick('cand') };
  return { timing, changed: fresh.base.games > 0 || fresh.cand.games > 0 || old === undefined };
}

/**
 * Runs every (lineup, seed) game of `plan.scenario` on both sides, reusing logs already on disk,
 * and returns the records sorted by (side, lineup, seed). `onProgress(done, total)` is called as
 * games finish. Writes `timing.json` into `plan.outDir` when a game ran (else keeps the old one).
 */
export async function runBatch(
  plan: BatchPlan,
  onProgress?: (done: number, total: number) => void,
): Promise<BatchResult> {
  const tasks = tasksOf(plan);
  const size = Math.max(1, Math.min(plan.workers ?? defaultWorkers(), tasks.length));
  const replies = await runTasks(tasks, size, (n) => onProgress?.(n, tasks.length));
  const records: RunRecord[] = [];
  const bySide: Record<'base' | 'cand', RunDone[]> = { base: [], cand: [] };
  for (const t of tasks) {
    const r = replies.get(t.job.id);
    if (r === undefined) {
      throw new Error(`game ${t.job.id} has no reply`);
    }
    bySide[t.side].push(r);
    records.push({
      side: t.side,
      lineup: t.lineup,
      seed: t.seed,
      key: t.key,
      logPath: t.job.outPath,
      ticks: r.ticks,
      end: r.end,
      hashDigest: r.hashDigest,
      values: r.values,
    });
  }
  records.sort((a, b) => sideRank(a.side) - sideRank(b.side) || a.lineup - b.lineup || a.seed - b.seed);
  const timing = mergeTiming(readTiming(plan.outDir), {
    base: timingOf(bySide.base),
    cand: timingOf(bySide.cand),
  });
  if (timing.changed) {
    writeTiming(plan.outDir, timing.timing);
  }
  const cached = [...replies.values()].filter((r) => r.cached === true).length;
  return { runs: records, timing: timing.timing, cached };
}

function sideRank(side: 'base' | 'cand'): number {
  return side === 'base' ? 0 : 1;
}

/**
 * Warnings for sides whose games repeat: "cand: 37 distinct games of 100". Seeds that do not change
 * the game (schedule mode, no noise) show as equal hash digests.
 */
export function distinctWarnings(runs: readonly RunRecord[]): string[] {
  const out: string[] = [];
  for (const side of ['base', 'cand'] as const) {
    const mine = runs.filter((r) => r.side === side);
    const distinct = new Set(mine.map((r) => r.hashDigest)).size;
    if (distinct < mine.length) {
      out.push(`${side}: ${distinct} distinct games of ${mine.length}`);
    }
  }
  return out;
}
