// What each `bhd` command does: runBatch -> buildReport -> files -> table. Side resolution and the
// built-in scenarios come in through `Deps` (they belong to the runner slice), so this stays testable.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { decodeLog } from '../replay/log.ts';
import type { Command, ReportCommand, RunCommand } from './args.ts';
import { renderHtml } from './html.ts';
import { METRICS } from './metrics/registry.ts';
import { runBatch } from './pool.ts';
import { buildReport } from './stats.ts';
import { renderTable } from './table.ts';
import type {
  BatchPlan,
  BatchResult,
  ReportOptions,
  ResolvedSide,
  RunRecord,
  Scenario,
  SideSpec,
  ViewOptions,
} from './types.ts';
import { runView } from './view.ts';

/** Where the output goes, relative to the working directory. */
const BHD_DIR = '.bhd';

/** The collaborators the runner slice provides. */
export interface Deps {
  /** Turns what the user typed into runnable code (snapshotting a ref when needed). */
  readonly resolveSide: (spec: SideSpec, side: 'base' | 'cand') => Promise<ResolvedSide>;
  /** The built-in `quick` / `deep` scenario, or the JSON file at `file`. */
  readonly loadScenario: (deep: boolean, file: string | undefined) => Scenario;
}

export interface Io {
  readonly out: (text: string) => void;
  readonly err: (text: string) => void;
}

/** Exit codes: failures are thrown, usage errors never get here. */
export async function runCommand(command: Command, deps: Deps, io: Io): Promise<void> {
  switch (command.cmd) {
    case 'report':
      return await reportCommand(command, deps, io);
    case 'run':
      return await runOneSide(command, deps, io);
    case 'view': {
      const options: ViewOptions = {
        logPath: resolve(command.log),
        ...(command.tick === undefined ? {} : { tick: command.tick }),
      };
      return await runView(options);
    }
    case 'clean':
      return clean(io);
    default:
      return;
  }
}

function clean(io: Io): void {
  for (const dir of ['runs', 'snap']) {
    rmSync(join(BHD_DIR, dir), { recursive: true, force: true });
  }
  io.out(`removed ${join(BHD_DIR, 'runs')} and ${join(BHD_DIR, 'snap')}`);
}

// ---------------------------------------------------------------- progress

/** Progress on stderr: `games done/total` and an ETA, redrawn in place at most every 250 ms. */
function progressReporter(io: Io, now: () => number = Date.now): (done: number, total: number) => void {
  const start = now();
  let last = 0;
  return (done, total) => {
    const t = now();
    if (done < total && t - last < 250) {
      return;
    }
    last = t;
    io.err(`\r${progressLine(done, total, t - start)}${done >= total ? '\n' : ''}`);
  };
}

/** `games 40/200  eta 12s`. */
export function progressLine(done: number, total: number, elapsedMs: number): string {
  const eta = done > 0 && done < total ? `  eta ${formatSeconds((elapsedMs / done) * (total - done))}` : '';
  return `games ${done}/${total}${eta}`;
}

function formatSeconds(ms: number): string {
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`;
}

// ---------------------------------------------------------------- batch

function hashOf(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12);
}

function sideIdentity(side: ResolvedSide): unknown {
  return { sha: side.sha, fingerprint: side.fingerprint, overrides: side.overrides ?? null };
}

/** Games per side -> seeds per lineup, for a scenario the user did not write themselves. */
function sizedScenario(scenario: Scenario, games: number): Scenario {
  const perLineup = Math.max(1, Math.ceil(games / Math.max(1, scenario.lineups.length)));
  return { ...scenario, seeds: { from: scenario.seeds.from, count: perLineup } };
}

async function runPlan(
  { scenario, base, cand, workers }: Omit<BatchPlan, 'outDir'>,
  io: Io,
): Promise<{ result: BatchResult; runKey: string }> {
  const runKey = hashOf({ scenario, base: sideIdentity(base), cand: sideIdentity(cand) });
  const outDir = join(BHD_DIR, 'runs', runKey);
  const plan = { scenario, base, cand, outDir, ...(workers === undefined ? {} : { workers }) };
  const result = await runBatch(plan, progressReporter(io));
  return { result, runKey };
}

function withWorkers(workers: number | undefined): { workers?: number } {
  return workers === undefined ? {} : { workers };
}

function reportOptions(deep: boolean): ReportOptions {
  return { floor: 0.02, q: 0.1, resamples: deep ? 1000 : 2000, seed: 1, bins: 12 };
}

function loadLogOf(run: RunRecord): ReturnType<typeof decodeLog> {
  return decodeLog(gunzipSync(readFileSync(run.logPath)).toString('utf8'));
}

async function reportCommand(command: ReportCommand, deps: Deps, io: Io): Promise<void> {
  const base = await deps.resolveSide(command.base, 'base');
  const cand = await deps.resolveSide(command.cand, 'cand');
  const loaded = deps.loadScenario(command.deep, command.scenario);
  const scenario = command.scenario === undefined ? sizedScenario(loaded, command.games) : loaded;
  const { result, runKey } = await runPlan({ scenario, base, cand, ...withWorkers(command.workers) }, io);
  if (result.cached > 0) {
    io.err(`${result.cached} of ${result.runs.length} runs reused from disk\n`);
  }
  const data = buildReport({
    scenario,
    base,
    cand,
    tags: command.tags,
    runs: result.runs,
    timing: result.timing,
    metrics: METRICS,
    options: reportOptions(command.deep),
    loadLog: loadLogOf,
  });
  const key = hashOf({ runKey, tags: command.tags });
  const dir = resolve(command.out ?? join(BHD_DIR, 'reports', key));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'report.json'), `${JSON.stringify(data, null, 2)}\n`);
  writeFileSync(join(dir, 'index.html'), renderHtml(data));
  io.out(renderTable(data));
  io.out(`\nreport: ${join(dir, 'index.html')}`);
}

// ---------------------------------------------------------------- run

function tally<T>(items: readonly T[], key: (item: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    counts.set(key(item), (counts.get(key(item)) ?? 0) + 1);
  }
  return [...counts].sort(([a], [b]) => (a < b ? -1 : 1));
}

/** The one-side summary printed by `bhd run`. */
function summarizeRuns(runs: readonly RunRecord[], msPerGame: number): string {
  const waves = runs.map((r) => r.end.wave);
  const mean = waves.reduce((a, b) => a + b, 0) / Math.max(1, waves.length);
  const distinct = new Set(runs.map((r) => r.hashDigest)).size;
  const lines = [`games: ${runs.length}`, 'outcomes:'];
  for (const [reason, n] of tally(runs, (r) => r.end.reason)) {
    lines.push(`  ${reason}: ${n} (${((100 * n) / Math.max(1, runs.length)).toFixed(1)}%)`);
  }
  lines.push(
    `wave reached: mean ${mean.toFixed(2)}, min ${Math.min(...waves)}, max ${Math.max(...waves)}`,
    `ms/game: ${msPerGame.toFixed(1)}`,
    `distinct games: ${distinct} of ${runs.length}`,
  );
  return lines.join('\n');
}

async function runOneSide(command: RunCommand, deps: Deps, io: Io): Promise<void> {
  const side = await deps.resolveSide(command.side, 'base');
  const loaded = deps.loadScenario(false, command.scenario);
  const scenario = command.scenario === undefined ? sizedScenario(loaded, command.games) : loaded;
  // runBatch always plays two sides; the cand copy of one side hits the same cache keys.
  const { result } = await runPlan(
    { scenario, base: side, cand: { ...side, side: 'cand' }, ...withWorkers(command.workers) },
    io,
  );
  const runs = result.runs.filter((r) => r.side === 'base');
  io.out(summarizeRuns(runs, result.timing.base.msPerGame));
}
