// Pool worker (step 2a): runs one game per `run` message and replies `done` or `error`.
// The game code is imported from the job's `root`, so base and cand may be different snapshots;
// everything else (log codec, metrics) is this checkout's.

import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { parentPort } from 'node:worker_threads';
import type { GameResult, GameSpec } from '../match/run.ts';
import type { LogHeader } from '../replay/log.ts';
import { decodeLog, encodeLog } from '../replay/log.ts';
import { computeMetrics } from './metrics/registry.ts';
import { hashDigest, reusableLog, writeLogFile } from './store.ts';
import type { GameLog, PoolMsg, RunDone, RunJob } from './types.ts';

interface RunModule {
  readonly RUN_ABI: number;
  readonly runGame: (spec: GameSpec) => GameResult;
}

const modules = new Map<string, Promise<RunModule>>();

function loadRun(root: string): Promise<RunModule> {
  let m = modules.get(root);
  if (m === undefined) {
    m = import(pathToFileURL(`${root}/src/match/run.ts`).href) as Promise<RunModule>;
    modules.set(root, m);
  }
  return m;
}

function done(job: RunJob, log: GameLog, ms: number, cached: boolean): RunDone {
  return {
    type: 'done',
    id: job.id,
    ticks: log.header.ticks,
    end: log.header.end,
    ms,
    ...(cached ? { cached } : {}),
    hashDigest: hashDigest(log.events),
    values: computeMetrics(log),
  };
}

/** Runs the job: reuses its log when one is there, else plays the game and writes the log. */
async function runJob(job: RunJob): Promise<RunDone> {
  const old = reusableLog(job.outPath, job.spec, job.meta);
  if (old !== undefined) {
    return done(job, old, 0, true);
  }
  const run = await loadRun(job.root);
  const t0 = performance.now();
  const result = run.runGame(job.spec);
  const ms = performance.now() - t0;
  const header: LogHeader = {
    format: 'bhd-log',
    v: 1,
    abi: job.spec.abi,
    side: job.meta.side,
    ref: job.meta.ref,
    sha: job.meta.sha,
    dirty: job.meta.dirty,
    fingerprint: job.meta.fingerprint,
    spec: job.spec,
    resolved: result.resolved,
    end: result.end,
    ticks: result.ticks,
  };
  const text = encodeLog(header, result.events);
  writeLogFile(job.outPath, text);
  // Metrics read the log as it will be read back, so a fresh run and a reused one agree.
  return done(job, decodeLog(text), ms, false);
}

parentPort?.on('message', (msg: PoolMsg) => {
  if (msg.type !== 'run') {
    return;
  }
  runJob(msg).then(
    (reply) => parentPort?.postMessage(reply satisfies PoolMsg),
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      parentPort?.postMessage({ type: 'error', id: msg.id, message } satisfies PoolMsg);
    },
  );
});
