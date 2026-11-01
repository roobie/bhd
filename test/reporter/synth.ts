// Synthetic report inputs for the stats and report tests: normal-ish data from detmath, no games.

import { createRng, nextFloat } from '../../src/detmath/index.ts';
import type { LogHeader } from '../../src/replay/log.ts';
import type {
  GameLog,
  MetricDef,
  ReportInput,
  ReportOptions,
  ResolvedSide,
  RunRecord,
} from '../../src/reporter/types.ts';
import type { SimEvent } from '../../src/sim/events.ts';

/** Standard normal samples (Irwin-Hall: 12 uniforms minus 6), reproducible from the seed. */
export function normals(seed: number): () => number {
  const rng = createRng(seed);
  return () => {
    let s = -6;
    for (let i = 0; i < 12; i++) {
      s += nextFloat(rng);
    }
    return s;
  };
}

const OPTIONS: ReportOptions = { floor: 0.02, q: 0.1, resamples: 500, seed: 12_345, bins: 12 };

export function metric(id: string, areas: string[], missing: 'zero' | 'skip' = 'zero'): MetricDef {
  return { id, title: id, unit: 'count', areas, missing, compute: () => ({}) };
}

function resolved(label: string, name: 'base' | 'cand'): ResolvedSide {
  return { side: name, label, ref: label, sha: `${name}sha0000`, dirty: false, fingerprint: 'f', root: '/x' };
}

export function run(side: 'base' | 'cand', lineup: number, seed: number, values: Record<string, number>): RunRecord {
  return {
    side,
    lineup,
    seed,
    key: `${side}-${lineup}-${seed}`,
    logPath: `.bhd/runs/k/${side}/${lineup}-${seed}.ndjson.gz`,
    ticks: 100,
    end: { tick: 100, wave: 3, reason: 'victory' },
    hashDigest: `${lineup}-${seed}`,
    values,
  };
}

/** A game log with only events (the header is never read by divergence). */
export function logOf(events: SimEvent[]): GameLog {
  return { header: {} as LogHeader, events };
}

export interface Synth {
  readonly pairs: number;
  /** Per series: the (base, cand) value of pair i. */
  readonly series: Record<string, (i: number) => readonly [number, number]>;
  readonly metrics: MetricDef[];
  readonly tags?: string[];
  readonly extraRuns?: RunRecord[];
  readonly loadLog?: (r: RunRecord) => GameLog;
  readonly options?: Partial<ReportOptions>;
}

export function makeInput(s: Synth): ReportInput {
  const runs: RunRecord[] = [];
  for (let i = 0; i < s.pairs; i++) {
    const a: Record<string, number> = {};
    const b: Record<string, number> = {};
    for (const [name, f] of Object.entries(s.series)) {
      [a[name], b[name]] = f(i);
    }
    runs.push(run('base', 0, i + 1, a), run('cand', 0, i + 1, b));
  }
  return {
    scenario: {
      id: 'quick',
      mode: 'director',
      seeds: { from: 1, count: s.pairs },
      lineups: [['a', 'b', 'c', 'd']],
      reactionSeconds: 0.4,
      thinkSeconds: 0.5,
      maxTicks: 1000,
      hashEvery: 30,
    },
    base: resolved('main', 'base'),
    cand: resolved('WORKTREE', 'cand'),
    tags: s.tags ?? [],
    runs: [...runs, ...(s.extraRuns ?? [])],
    metrics: s.metrics,
    options: { ...OPTIONS, ...s.options },
    loadLog: s.loadLog ?? (() => logOf([])),
  };
}
