// The reporter's contracts: every shape the step-2 slices (runner, metrics, stats, report, CLI,
// replay) exchange. Types only, plus `seriesName`. Wave w3-reporter DESIGN.md is the narrative.
// Everything here is JSON-shaped so it can cross a worker boundary or land in report.json.

import type { ConfigOverrides } from '../content/overrides.ts';
import type { GameEnd, GameSpec, Mode } from '../match/run.ts';
import type { DecodedLog } from '../replay/log.ts';

// ---------------------------------------------------------------- scenario

/** A batch of games: the lineups x seeds grid both sides play. */
export interface Scenario {
  readonly id: string;
  readonly mode: Mode;
  /** Games use seeds `from .. from + count - 1`. */
  readonly seeds: { readonly from: number; readonly count: number };
  /** Each lineup is 4 doctrine ids (hero slots 0-3). Games = lineups.length x seeds.count per side. */
  readonly lineups: readonly (readonly string[])[];
  readonly reactionSeconds: number;
  readonly thinkSeconds: number;
  readonly maxTicks: number;
  readonly hashEvery: number;
}

// ---------------------------------------------------------------- sides

/**
 * What the user typed for `--base` / `--cand`, parsed:
 *  - `ref`: a git ref (branch, tag, sha), snapshotted with `git archive`;
 *  - `worktree`: the working tree as it is (`WORKTREE`, the default for cand);
 *  - `overrides`: the working tree plus an overrides JSON file (`path.json`);
 *  - `ref-overrides`: a ref plus an overrides file (`ref:path.json`).
 */
export type SideSpec =
  | { readonly kind: 'ref'; readonly ref: string }
  | { readonly kind: 'worktree' }
  | { readonly kind: 'overrides'; readonly path: string }
  | { readonly kind: 'ref-overrides'; readonly ref: string; readonly path: string };

/** A side after resolution: a directory holding runnable code, and the identity of that code. */
export interface ResolvedSide {
  readonly side: 'base' | 'cand';
  /** The side as the user wrote it (`main`, `WORKTREE`, `x.json`...). */
  readonly label: string;
  /** Ref name stored in log headers. */
  readonly ref: string;
  readonly sha: string;
  /** Uncommitted changes in the code (worktree sides). */
  readonly dirty: boolean;
  /** SHA-256 of the sorted sources of the pure dirs; part of the run key. */
  readonly fingerprint: string;
  /** Directory that has `src/match/run.ts` (the repo, or `.bhd/snap/<sha>`). */
  readonly root: string;
  /** Parsed overrides layered on top, if the side has any. */
  readonly overrides?: ConfigOverrides;
}

// ---------------------------------------------------------------- metrics

/** A finished game as metrics see it: decoded header plus events. */
export type GameLog = DecodedLog;

/**
 * Series values of one game: `seriesName(metric, key)` -> number. A metric returns only the keys it
 * has in that game; a key absent on either side of a pair is handled by `MetricDef.missing`.
 */
export type MetricValues = Readonly<Record<string, number>>;

/** `id` for a single-valued metric (empty key), else `id[key]`, e.g. `hero.deaths[gunner]`. */
export function seriesName(metric: string, key: string): string {
  return key === '' ? metric : `${metric}[${key}]`;
}

export interface MetricDef {
  /** Dotted id, e.g. `gunner.heat.band`; also a prefix of its series names. */
  readonly id: string;
  readonly title: string;
  /** Short unit label for tables (`count`, `fraction`, `ticks`...). */
  readonly unit: string;
  /** Areas this metric belongs to; `--tag` matches them by dot-segment prefix, in either direction. */
  readonly areas: readonly string[];
  /** A pair where a key is absent on one side: `zero` counts it as 0, `skip` drops that pair. */
  readonly missing: 'zero' | 'skip';
  /** Per-game values keyed by series key (`''` for a single-valued metric). Pure and deterministic. */
  readonly compute: (log: GameLog) => Record<string, number>;
}

// ---------------------------------------------------------------- runner and pool

/** The part of a log header the runner knows before the game runs. */
export interface LogMeta {
  readonly side: string;
  readonly ref: string;
  readonly sha: string;
  readonly dirty: boolean;
  readonly fingerprint: string;
}

/** Main -> worker: run one game from the code at `root`. */
export interface RunJob {
  readonly type: 'run';
  /** Echoed back in the reply. */
  readonly id: number;
  readonly root: string;
  readonly spec: GameSpec;
  readonly meta: LogMeta;
  /** Where the worker writes the gzipped log. */
  readonly outPath: string;
}

/** Worker -> main: the game ran, its log is written. */
export interface RunDone {
  readonly type: 'done';
  readonly id: number;
  readonly ticks: number;
  readonly end: GameEnd;
  /** Wall time of `runGame` only, ms. Never written into logs. */
  readonly ms: number;
  /** Digest of the game's `hash` events; equal digests mean the same game. */
  readonly hashDigest: string;
  readonly values: MetricValues;
}

/** Worker -> main: the job failed. */
export interface RunFailed {
  readonly type: 'error';
  readonly id: number;
  readonly message: string;
}

export type PoolMsg = RunJob | RunDone | RunFailed;

/** One side's games in a batch, with where each log is. */
export interface RunRecord {
  readonly side: 'base' | 'cand';
  /** Index into `Scenario.lineups`. */
  readonly lineup: number;
  readonly seed: number;
  /** Run key: hash of fingerprint + overrides + spec. */
  readonly key: string;
  readonly logPath: string;
  readonly ticks: number;
  readonly end: GameEnd;
  readonly hashDigest: string;
  readonly values: MetricValues;
}

/** What a batch needs. */
export interface BatchPlan {
  readonly scenario: Scenario;
  readonly base: ResolvedSide;
  readonly cand: ResolvedSide;
  /** Directory the run logs go under (`.bhd/runs/<key>`). */
  readonly outDir: string;
  /** Worker threads; default `availableParallelism() - 1`. */
  readonly workers?: number;
}

/** ms per game, per side (written to timing.json, shown in the report footer). */
export interface Timing {
  readonly base: { readonly games: number; readonly msPerGame: number };
  readonly cand: { readonly games: number; readonly msPerGame: number };
}

export interface BatchResult {
  /** Sorted by (side, lineup, seed): the worker count never changes it. */
  readonly runs: readonly RunRecord[];
  readonly timing: Timing;
  /** Runs that were reused from an existing log. */
  readonly cached: number;
}

// ---------------------------------------------------------------- report data

export interface ReportOptions {
  /** Hide a series whose |relative change| is below this (default 0.02). */
  readonly floor: number;
  /** Benjamini-Hochberg false discovery rate (default 0.1). */
  readonly q: number;
  /** Bootstrap resamples (2000 quick, 1000 deep). */
  readonly resamples: number;
  /** Seed of the bootstrap rng. */
  readonly seed: number;
  /** Histogram bins (default 12). */
  readonly bins: number;
}

/** Everything `buildReport` reads. Logs are loaded lazily, only for divergence. */
export interface ReportInput {
  readonly scenario: Scenario;
  readonly base: ResolvedSide;
  readonly cand: ResolvedSide;
  /** `--tag` values. */
  readonly tags: readonly string[];
  readonly runs: readonly RunRecord[];
  readonly timing: Timing;
  readonly metrics: readonly MetricDef[];
  readonly options: ReportOptions;
  readonly loadLog: (run: RunRecord) => GameLog;
}

export interface SideInfo {
  readonly label: string;
  readonly ref: string;
  readonly sha: string;
  readonly dirty: boolean;
}

export interface ReportHeader {
  readonly scenario: string;
  readonly tags: readonly string[];
  readonly base: SideInfo;
  readonly cand: SideInfo;
  /** Paired games: same (lineup, seed) on both sides. */
  readonly pairs: number;
  /** Distinct games (by hash digest) per side; below `pairs` means seeds repeat the same game. */
  readonly distinct: { readonly base: number; readonly cand: number };
  /** Series that were tested. */
  readonly seriesTested: number;
  readonly options: ReportOptions;
  readonly msPerGame: { readonly base: number; readonly cand: number };
  /** Unknown tags, distinct-games warnings... shown at the top. */
  readonly warnings: readonly string[];
}

/** Equal-width bins over the shared base and cand range. */
export interface Histogram {
  readonly lo: number;
  readonly hi: number;
  readonly base: readonly number[];
  readonly cand: readonly number[];
}

/** Where the largest paired difference of a series first diverges. */
export interface Divergence {
  readonly series: string;
  readonly lineup: number;
  readonly seed: number;
  /** First tick where the non-`hash` events differ; null when the two logs are identical. */
  readonly tick: number | null;
  readonly baseLog: string;
  readonly candLog: string;
}

/** The paired comparison of one series. d = cand - base. */
export interface SeriesStat {
  readonly name: string;
  readonly metric: string;
  readonly areas: readonly string[];
  readonly unit: string;
  /** Pairs used (after `skip` drops). */
  readonly n: number;
  readonly meanBase: number;
  readonly meanCand: number;
  readonly meanDiff: number;
  /** meanDiff / meanBase; null when meanBase is 0. */
  readonly rel: number | null;
  /** Percentile bootstrap 95% CI of the mean difference. */
  readonly ci: readonly [number, number];
  /** |meanDiff| / sd(base); the ranking key. 0 when sd is 0. */
  readonly effect: number;
  /** Bootstrap two-sided p, used by Benjamini-Hochberg. */
  readonly p: number;
  /** Survives the noise floor: CI excludes 0, |rel| >= floor, passes BH. */
  readonly significant: boolean;
  /** Matches one of the report's tags (always false when there are no tags). */
  readonly inTag: boolean;
  /** Significant, tags were given, and no tag matches: the reason the report exists. */
  readonly outside: boolean;
  readonly histogram: Histogram;
  /** Only for the top movers. */
  readonly divergence?: Divergence;
}

/** Share of each option of one decision, base vs cand (from `choice.spread`). */
export interface ChoiceSpreadRow {
  readonly hero: string;
  readonly decision: string;
  readonly options: readonly { readonly option: string; readonly base: number; readonly cand: number }[];
  /** Some option exceeds 90% on either side: the decision has become a tax. */
  readonly tax: boolean;
}

/** The whole report: `report.json`, and the input of both renderers. */
export interface ReportData {
  readonly header: ReportHeader;
  /** Every tested series, ranked by effect size, largest first. */
  readonly series: readonly SeriesStat[];
  /** Names of the significant series, in rank order. */
  readonly movers: readonly string[];
  /** Names of movers that match no tag. */
  readonly outside: readonly string[];
  readonly choiceSpread: readonly ChoiceSpreadRow[];
}

// ---------------------------------------------------------------- view

export interface ViewOptions {
  /** A decompressed-on-the-fly `.ndjson.gz` log. */
  readonly logPath: string;
  /** Open paused at this tick (the viewer fast-forwards to tick - 60). */
  readonly tick?: number;
  readonly port?: number;
  /** Open the browser (default true). */
  readonly open?: boolean;
}
