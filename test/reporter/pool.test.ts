import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { distinctWarnings, runBatch } from '../../src/reporter/pool.ts';
import { QUICK } from '../../src/reporter/scenarios.ts';
import type { BatchPlan, ResolvedSide, RunRecord, Scenario } from '../../src/reporter/types.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), 'bhd-pool-'));

// 2 lineups x 3 seeds = 6 games per side, cut off early: this checks plumbing, not play.
const SHORT: Scenario = { ...QUICK, id: 'short', seeds: { from: 1, count: 3 }, maxTicks: 600 };

function side(which: 'base' | 'cand'): ResolvedSide {
  return { side: which, label: 'WORKTREE', ref: 'WORKTREE', sha: 'abc', dirty: false, fingerprint: 'fp', root: ROOT };
}

function plan(name: string, workers: number): BatchPlan {
  return { scenario: SHORT, base: side('base'), cand: side('cand'), outDir: join(TMP, name), workers };
}

/** Every file under `dir` as `relative path -> bytes`. */
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const s of ['base', 'cand']) {
    for (const f of readdirSync(join(dir, s)).sort()) {
      out.set(`${s}/${f}`, readFileSync(join(dir, s, f)).toString('base64'));
    }
  }
  return out;
}

afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe('runBatch', () => {
  it('writes byte-identical logs with 1 and 3 workers, sorted by (side, lineup, seed)', async () => {
    const one = await runBatch(plan('one', 1));
    const three = await runBatch(plan('three', 3));
    expect(one.runs).toHaveLength(12);
    expect(snapshot(join(TMP, 'one'))).toEqual(snapshot(join(TMP, 'three')));
    // Paths differ by directory; everything else about the records must agree.
    const strip = (runs: readonly RunRecord[]): unknown[] => runs.map(({ logPath: _, ...rest }) => rest);
    expect(strip(one.runs)).toEqual(strip(three.runs));
    const order = one.runs.map((r) => `${r.side}/${r.lineup}/${r.seed}`);
    expect(order).toEqual([...order].sort((a, b) => (a < b ? -1 : 1)));
    expect(one.cached).toBe(0);
  }, 120_000);

  it('reuses the logs on a second run and gives the same records', async () => {
    const first = await runBatch(plan('reuse', 2));
    const again = await runBatch(plan('reuse', 2));
    expect(again.cached).toBe(12);
    expect(again.runs).toEqual(first.runs);
    expect(again.timing.base.games).toBe(0);
  }, 120_000);

  it('reports progress up to the total', async () => {
    const seen: number[] = [];
    await runBatch(plan('progress', 2), (done, total) => {
      expect(total).toBe(12);
      seen.push(done);
    });
    expect(seen.at(-1)).toBe(12);
  }, 120_000);
});

describe('distinctWarnings', () => {
  const run = (digest: string, seed: number): RunRecord => ({
    side: 'base',
    lineup: 0,
    seed,
    key: 'k',
    logPath: '',
    ticks: 1,
    end: { tick: 1, wave: 1, reason: 'maxTicks' },
    hashDigest: digest,
    values: {},
  });

  it('warns when hash sequences repeat', () => {
    expect(distinctWarnings([run('a', 1), run('a', 2), run('b', 3)])).toEqual(['base: 2 distinct games of 3']);
  });

  it('is quiet when every game differs', () => {
    expect(distinctWarnings([run('a', 1), run('b', 2)])).toEqual([]);
  });
});
