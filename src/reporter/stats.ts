// Paired statistics and the report data model (step 2c).
//
// Pairs are the same (lineup, seed) on both sides, d = cand - base. Per series: mean d, relative
// change, a percentile bootstrap 95% CI (detmath rng, fixed seed), effect size |mean d| / sd(base),
// then a noise floor: CI excludes 0, |rel| >= floor and Benjamini-Hochberg at q across all series.

import { createRng, nextInt } from '../detmath/index.ts';
import { findDivergence } from './diverge.ts';
import type {
  ChoiceSpreadRow,
  Histogram,
  MetricDef,
  ReportData,
  ReportHeader,
  ReportInput,
  RunRecord,
  SeriesStat,
} from './types.ts';

/** How many of the top movers get a divergence lookup (each loads two logs). */
const DIVERGENCE_MOVERS = 10;
/** Share above which a choice option is a tax. */
const TAX_SHARE = 0.9;
const CHOICE_METRIC = 'choice.spread';
/** Fewer pairs than this and a series is untested: p = 1, never a mover, outside the BH family. */
const MIN_PAIRS = 10;

interface Pair {
  readonly lineup: number;
  readonly seed: number;
  readonly base: RunRecord;
  readonly cand: RunRecord;
}

/** The paired values of one series. `pairs[i]` produced `a[i]` and `b[i]`. */
interface Sample {
  readonly a: number[];
  readonly b: number[];
  readonly pairs: Pair[];
}

type Draft = Omit<SeriesStat, 'significant' | 'outside' | 'divergence'>;
const NO_AREAS: readonly string[] = [];

// ---------------------------------------------------------------- pairing

function pairKey(r: RunRecord): string {
  return `${r.lineup}:${r.seed}`;
}

function bySide(runs: readonly RunRecord[], side: 'base' | 'cand'): Map<string, RunRecord> {
  const out = new Map<string, RunRecord>();
  for (const r of runs) {
    if (r.side === side && !out.has(pairKey(r))) {
      out.set(pairKey(r), r);
    }
  }
  return out;
}

/** Same (lineup, seed) on both sides, sorted by (lineup, seed). Unmatched runs are dropped. */
export function pairRuns(runs: readonly RunRecord[]): Pair[] {
  const cand = bySide(runs, 'cand');
  const pairs: Pair[] = [];
  for (const [key, base] of bySide(runs, 'base')) {
    const c = cand.get(key);
    if (c !== undefined) {
      pairs.push({ lineup: base.lineup, seed: base.seed, base, cand: c });
    }
  }
  return pairs.sort((x, y) => x.lineup - y.lineup || x.seed - y.seed);
}

// ---------------------------------------------------------------- numbers

function mean(xs: readonly number[]): number {
  let s = 0;
  for (const x of xs) {
    s += x;
  }
  return xs.length === 0 ? 0 : s / xs.length;
}

/** Sample standard deviation; 0 for fewer than two values. */
function sd(xs: readonly number[]): number {
  if (xs.length < 2 || xs.every((x) => x === xs[0])) {
    return 0;
  }
  const m = mean(xs);
  let s = 0;
  for (const x of xs) {
    s += (x - m) * (x - m);
  }
  return Math.sqrt(s / (xs.length - 1));
}

/** Resample indices, shared by every series with the same n (common random numbers). */
type IndexCache = (n: number) => Uint32Array;

function indexCache(resamples: number, seed: number): IndexCache {
  const cache = new Map<number, Uint32Array>();
  return (n) => {
    let idx = cache.get(n);
    if (idx === undefined) {
      const rng = createRng(seed);
      idx = new Uint32Array(resamples * n);
      for (let i = 0; i < idx.length; i++) {
        idx[i] = nextInt(rng, n);
      }
      cache.set(n, idx);
    }
    return idx;
  };
}

interface Boot {
  readonly ci: readonly [number, number];
  readonly p: number;
}

/** Percentile bootstrap of the mean of `d`: 95% CI and a two-sided p. */
export function bootstrapMean(d: readonly number[], resamples: number, seed: number): Boot {
  return bootstrapWith(d, resamples, indexCache(resamples, seed));
}

function bootstrapWith(d: readonly number[], resamples: number, cache: IndexCache): Boot {
  const n = d.length;
  const [first] = d;
  if (first === undefined) {
    return { ci: [0, 0], p: 1 };
  }
  if (n >= MIN_PAIRS && d.every((x) => x === first)) {
    // Exact: summing n copies of d could be off by an ulp.
    return { ci: [first, first], p: first === 0 ? 1 : 0 };
  }
  const idx = cache(n);
  const means = new Float64Array(resamples);
  let le = 0;
  let ge = 0;
  for (let r = 0; r < resamples; r++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      s += d[idx[r * n + i] as number] as number;
    }
    const m = s / n;
    means[r] = m;
    le += m <= 0 ? 1 : 0;
    ge += m >= 0 ? 1 : 0;
  }
  means.sort();
  const lo = means[Math.floor(0.025 * resamples)] as number;
  const hi = means[Math.ceil(0.975 * resamples) - 1] as number;
  // Add-one p: a resampled mean never makes p exactly 0.
  return { ci: [lo, hi], p: Math.min(1, (2 * (Math.min(le, ge) + 1)) / (resamples + 1)) };
}

/** Benjamini-Hochberg: which hypotheses are rejected at false discovery rate q. */
export function benjaminiHochberg(ps: readonly number[], q: number): boolean[] {
  const m = ps.length;
  const order = ps.map((_, i) => i).sort((x, y) => (ps[x] as number) - (ps[y] as number) || x - y);
  let cut = 0;
  order.forEach((i, rank) => {
    if ((ps[i] as number) <= (q * (rank + 1)) / m) {
      cut = rank + 1;
    }
  });
  const out = ps.map(() => false);
  for (let rank = 0; rank < cut; rank++) {
    out[order[rank] as number] = true;
  }
  return out;
}

// ---------------------------------------------------------------- tags

/** A tag and an area match when one is a dot-segment prefix of the other (`gunner` ~ `gunner.heat`). */
export function tagMatches(area: string, tag: string): boolean {
  return area === tag || area.startsWith(`${tag}.`) || tag.startsWith(`${area}.`);
}

function inTags(areas: readonly string[], tags: readonly string[]): boolean {
  return areas.some((a) => tags.some((t) => tagMatches(a, t)));
}

// ---------------------------------------------------------------- histograms

function bin(v: number, lo: number, hi: number, bins: number): number {
  if (hi <= lo) {
    return 0;
  }
  return Math.min(bins - 1, Math.floor(((v - lo) / (hi - lo)) * bins));
}

function histogram(a: readonly number[], b: readonly number[], bins: number): Histogram {
  const all = [...a, ...b];
  const lo = all.reduce((x, y) => Math.min(x, y), Number.POSITIVE_INFINITY);
  const hi = all.reduce((x, y) => Math.max(x, y), Number.NEGATIVE_INFINITY);
  const ha = new Array<number>(bins).fill(0);
  const hb = new Array<number>(bins).fill(0);
  for (const v of a) {
    ha[bin(v, lo, hi, bins)] = (ha[bin(v, lo, hi, bins)] as number) + 1;
  }
  for (const v of b) {
    hb[bin(v, lo, hi, bins)] = (hb[bin(v, lo, hi, bins)] as number) + 1;
  }
  return { lo: all.length === 0 ? 0 : lo, hi: all.length === 0 ? 0 : hi, base: ha, cand: hb };
}

// ---------------------------------------------------------------- series

function metricOf(name: string, byId: ReadonlyMap<string, MetricDef>): MetricDef | undefined {
  const at = name.indexOf('[');
  return byId.get(at < 0 ? name : name.slice(0, at));
}

/** The key of a series name: `m[key]` -> `key`, `m` -> `''`. */
function keyOf(name: string): string {
  const at = name.indexOf('[');
  return at < 0 ? '' : name.slice(at + 1, -1);
}

/** Per run: the `metric[group` tokens present, for metrics with a decision-level group. */
type GroupIndex = (run: RunRecord) => ReadonlySet<string>;

function groupIndex(byId: ReadonlyMap<string, MetricDef>): GroupIndex {
  const cache = new WeakMap<RunRecord, Set<string>>();
  return (run) => {
    let set = cache.get(run);
    if (set === undefined) {
      set = new Set();
      for (const name of Object.keys(run.values)) {
        const m = metricOf(name, byId);
        if (m?.group !== undefined) {
          set.add(`${m.id}\u0000${m.group(keyOf(name))}`);
        }
      }
      cache.set(run, set);
    }
    return set;
  };
}

/**
 * The paired values of one series. `zero`: a key absent on a side counts as 0, so a pair absent on
 * both sides is 0 vs 0. `skip`: the pair is dropped. With a `group`, the pair is dropped when the
 * group is absent on either side, else absent keys count as 0.
 */
function sampleOf(name: string, pairs: readonly Pair[], metric: MetricDef | undefined, groups: GroupIndex): Sample {
  const out: Sample = { a: [], b: [], pairs: [] };
  const token = metric?.group === undefined ? undefined : `${metric.id}\u0000${metric.group(keyOf(name))}`;
  const missing = metric?.missing ?? 'zero';
  for (const p of pairs) {
    const av = p.base.values[name];
    const bv = p.cand.values[name];
    const skip =
      token === undefined
        ? missing === 'skip' && (av === undefined || bv === undefined)
        : !(groups(p.base).has(token) && groups(p.cand).has(token));
    if (skip) {
      continue;
    }
    out.a.push(av ?? 0);
    out.b.push(bv ?? 0);
    out.pairs.push(p);
  }
  return out;
}

function seriesNames(pairs: readonly Pair[]): string[] {
  const names = new Set<string>();
  for (const p of pairs) {
    for (const side of [p.base, p.cand]) {
      for (const k of Object.keys(side.values)) {
        names.add(k);
      }
    }
  }
  return [...names].sort();
}

interface DraftCtx {
  readonly input: ReportInput;
  readonly cache: IndexCache;
}

function draftOf(name: string, metric: MetricDef | undefined, s: Sample, ctx: DraftCtx): Draft {
  const { options, tags } = ctx.input;
  const diffs = s.b.map((v, i) => v - (s.a[i] as number));
  const meanBase = mean(s.a);
  const meanDiff = mean(diffs);
  // sd(base) is 0 when the base never varies; the spread of d is then the next best yardstick.
  const spread = sd(s.a) || sd(diffs);
  const boot = bootstrapWith(diffs, options.resamples, ctx.cache);
  const tested = diffs.length >= MIN_PAIRS;
  const areas = metric?.areasOf?.(keyOf(name)) ?? metric?.areas ?? NO_AREAS;
  return {
    name,
    metric: metric?.id ?? name,
    areas,
    unit: metric?.unit ?? '',
    n: diffs.length,
    meanBase,
    meanCand: mean(s.b),
    meanDiff,
    rel: meanBase === 0 ? null : meanDiff / meanBase,
    ci: boot.ci,
    effect: spread === 0 ? 0 : Math.abs(meanDiff) / spread,
    p: tested ? boot.p : 1,
    tested,
    inTag: inTags(areas, tags),
    histogram: histogram(s.a, s.b, options.bins),
  };
}

function passesFloor(d: Draft, floor: number): boolean {
  const [lo, hi] = d.ci;
  return !(lo <= 0 && hi >= 0) && (d.rel === null || Math.abs(d.rel) >= floor);
}

// ---------------------------------------------------------------- choice spread

/** `choice.spread[hero:decision:option]` -> its parts. */
function parseChoice(name: string): { hero: string; decision: string; option: string } | undefined {
  const open = name.indexOf('[');
  const key = name.slice(open + 1, -1);
  const first = key.indexOf(':');
  const last = key.lastIndexOf(':');
  if (open < 0 || first < 0 || last <= first) {
    return undefined;
  }
  return { hero: key.slice(0, first), decision: key.slice(first + 1, last), option: key.slice(last + 1) };
}

function choiceRows(drafts: readonly Draft[]): ChoiceSpreadRow[] {
  const rows = new Map<string, { hero: string; decision: string; options: ChoiceSpreadRow['options'][number][] }>();
  for (const d of drafts) {
    const c = d.metric === CHOICE_METRIC ? parseChoice(d.name) : undefined;
    if (c === undefined) {
      continue;
    }
    const key = `${c.hero}\u0000${c.decision}`;
    const row = rows.get(key) ?? { hero: c.hero, decision: c.decision, options: [] };
    row.options.push({ option: c.option, base: d.meanBase, cand: d.meanCand });
    rows.set(key, row);
  }
  return [...rows.values()].map((r) => ({
    ...r,
    tax: r.options.some((o) => o.base > TAX_SHARE || o.cand > TAX_SHARE),
  }));
}

// ---------------------------------------------------------------- header

function distinct(pairs: readonly Pair[], side: 'base' | 'cand'): number {
  return new Set(pairs.map((p) => p[side].hashDigest)).size;
}

/** Every area a metric or one of the tested series belongs to. */
function knownAreas(metrics: readonly MetricDef[], drafts: readonly Draft[]): string[] {
  return [...new Set([...metrics.flatMap((m) => m.areas), ...drafts.flatMap((d) => d.areas)])].sort();
}

function warningsOf(input: ReportInput, pairs: readonly Pair[], areas: readonly string[]): string[] {
  const out: string[] = [];
  for (const tag of input.tags) {
    if (!areas.some((a) => tagMatches(a, tag))) {
      out.push(`unknown tag '${tag}'; known areas: ${areas.join(', ')}`);
    }
  }
  const unmatched = input.runs.length - 2 * pairs.length;
  if (unmatched > 0) {
    out.push(`${unmatched} runs had no partner on the other side and were dropped`);
  }
  if (pairs.length === 0) {
    out.push('no paired games');
  }
  for (const side of ['base', 'cand'] as const) {
    const n = distinct(pairs, side);
    if (n < pairs.length) {
      out.push(`${side}: ${n} distinct games of ${pairs.length}`);
    }
  }
  return out;
}

function headerOf(input: ReportInput, pairs: readonly Pair[], drafts: readonly Draft[]): ReportHeader {
  const tested = drafts.filter((d) => d.tested).length;
  const side = (s: ReportInput['base']) => ({ label: s.label, ref: s.ref, sha: s.sha, dirty: s.dirty });
  return {
    scenario: input.scenario.id,
    tags: input.tags,
    base: side(input.base),
    cand: side(input.cand),
    pairs: pairs.length,
    distinct: { base: distinct(pairs, 'base'), cand: distinct(pairs, 'cand') },
    seriesTested: tested,
    seriesUntested: drafts.length - tested,
    options: input.options,
    warnings: warningsOf(input, pairs, knownAreas(input.metrics, drafts)),
  };
}

// ---------------------------------------------------------------- report

function withDivergence(
  stat: SeriesStat,
  samples: ReadonlyMap<string, Sample>,
  load: ReportInput['loadLog'],
): SeriesStat {
  const s = samples.get(stat.name);
  if (s === undefined || s.pairs.length === 0) {
    return stat;
  }
  const dir = stat.meanDiff < 0 ? -1 : 1;
  let best = 0;
  let bestD = Number.NEGATIVE_INFINITY;
  s.pairs.forEach((_, i) => {
    const d = dir * ((s.b[i] as number) - (s.a[i] as number));
    if (d > bestD) {
      bestD = d;
      best = i;
    }
  });
  const pair = s.pairs[best] as Pair;
  return { ...stat, divergence: findDivergence(stat.name, pair.base, pair.cand, load) };
}

/** Pairs the runs by (lineup, seed), tests every series and ranks the movers. Deterministic. */
export function buildReport(input: ReportInput): ReportData {
  const pairs = pairRuns(input.runs);
  const byId = new Map(input.metrics.map((m) => [m.id, m]));
  const ctx: DraftCtx = { input, cache: indexCache(input.options.resamples, input.options.seed) };
  const groups = groupIndex(byId);
  const samples = new Map<string, Sample>();
  const drafts: Draft[] = [];
  for (const name of seriesNames(pairs)) {
    const metric = metricOf(name, byId);
    const s = sampleOf(name, pairs, metric, groups);
    if (s.pairs.length > 0) {
      samples.set(name, s);
      drafts.push(draftOf(name, metric, s, ctx));
    }
  }
  // Untested series (too few pairs) are not part of the BH family.
  const testedDrafts = drafts.filter((d) => d.tested);
  const bh = new Map<string, boolean>();
  benjaminiHochberg(
    testedDrafts.map((d) => d.p),
    input.options.q,
  ).forEach((rejected, i) => {
    bh.set((testedDrafts[i] as Draft).name, rejected);
  });
  const tagged = input.tags.length > 0;
  const ranked = drafts
    .map((d): SeriesStat => {
      const significant = d.tested && bh.get(d.name) === true && passesFloor(d, input.options.floor);
      return { ...d, significant, outside: significant && tagged && !d.inTag };
    })
    .sort((x, y) => y.effect - x.effect || (x.name < y.name ? -1 : 1));
  const movers = ranked.filter((s) => s.significant).map((s) => s.name);
  const top = new Set(movers.slice(0, DIVERGENCE_MOVERS));
  const series = ranked.map((s) => (top.has(s.name) ? withDivergence(s, samples, input.loadLog) : s));
  return {
    header: headerOf(input, pairs, drafts),
    series,
    movers,
    outside: series.filter((s) => s.outside).map((s) => s.name),
    choiceSpread: choiceRows(drafts),
  };
}

/** The bytes of `report.json`: stable for a fixed input. */
export function reportJson(data: ReportData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}
