---
phase: finalize
parent: U-AC4HHMUS5PO43H3U
owner:
  - claude
created: 2026-11-01
success_criteria:
  - 'npm run ci exits 0 with the runner in place: pool, worker, sides, snapshot, store, scenarios and their tests'
  - a short scenario (maxTicks 600, 6 games per side) gives byte-identical logs with 1 and 3 workers
  - ref, json and ref:json parsing and the cache key are tested; no test pins gameplay
  - a 100-pair quick batch (WORKTREE vs WORKTREE) runs and its wall time and ms/game are recorded here
---

# slice/w3-runner

## Purpose
Run a batch of all-bot games for two code sides on a worker-thread pool and store the logs, so metrics, stats and the CLI have records to read (wave w3-reporter, step 2a).

## Scope
In: src/reporter/{pool,worker,sides,snapshot,store,scenarios}.ts, test/reporter/{pool,sides}.test.ts, their lines in knip.jsonc.
Out: metrics, stats, html, table, cli, args, commands, view, replay and client files (other slices).

## Context & constraints
Contracts are in src/reporter/types.ts. Node code only in src/reporter. Plain git, never push. No gameplay-pinning tests (D-4E4QRJ7N6LIGZDSD).

## Now
Done; waiting for the lead to merge and close.

## Next
- lead merges the branch and closes the slice

## Evidence
- Workers load `.ts` through Node's own type stripping (Node 26), plain `new Worker(new URL('./worker.ts', import.meta.url))`, no flags and no workaround, both from node directly and under vitest (the pool test spawns real threads from a vitest module).
- `npm run ci` exit 0: node 40 files / 580 tests, browser unchanged (12 files / 81 tests in the contracts run).
- Pool test: 1 vs 3 workers give byte-identical `.ndjson.gz` files and equal records; a second run reuses all 12 logs (`cached` 12).
- 100-pair quick batch (QUICK: director mode, 2 lineups x 50 seeds, 200 games), WORKTREE vs WORKTREE, 15 workers on a 16-core box shared with other agents: wall 6,419 ms, 32 ms per game of wall time (200 games). `timing.json`: base 564 ms/game, cand 309 ms/game (per-thread `runGame` time; base ran first, so it carries JIT warm-up and contention). No "distinct games" warning: 200 distinct hash digests. Logs: 9.0 MB. A re-run of the same batch reused all 200 logs in 253 ms.

## Harvest
- [ ] decision: `RunDone.cached?: boolean` added to types.ts. A worker reuses an existing log (same side identity and run key), then `ms` is 0 and timing leaves it out of ms/game. Additive deviation from the contracts.
- [ ] decision: log reuse happens inside the worker, not the pool: it decodes the file and computes metrics from it, and a fresh run does the same from the encoded text, so cached and fresh values agree.
- [ ] decision: the run key is `sha256(fingerprint + stableStringify(spec))[0:16]` (overrides live in the spec); `batchKey(scenario, base, cand)` names the `.bhd/runs/<key>` dir. Both live in store.ts; the CLI picks `outDir`.
- [ ] decision: `distinctWarnings(runs)` in pool.ts returns the "N distinct games of M" strings; `runBatch` does not print. The CLI and stats show them.
- [ ] decision: refs are checked before archiving: `git show <sha>:src/match/run.ts` must exist and its `RUN_ABI` literal must equal this checkout's; snapshots are extracted to a temp dir and renamed.
- [ ] decision: PURE_DIRS for the fingerprint is duplicated in sides.ts (src must not import from test/); keep it in step with test/purity-scan.ts.
- [ ] decision: knip `ignoreIssues` for src/reporter/store.ts exports (readLogFile is the CLI slice's loadLog); pool.ts left the ignore list.
- [ ] backlog: `withGames` rounds `--games N` up to whole lineups (N=100 on 3 lineups gives 102); the CLI may want to say so.
- [ ] learning: a 16-thread quick batch takes about 6 s here, against the design's 4 s guess; the machine was shared.

## Log
- 2026-11-01 initialized
- 2026-11-01 execute: scenarios, store, snapshot, sides, worker, pool and tests written; ci green; 100-pair batch timed
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
