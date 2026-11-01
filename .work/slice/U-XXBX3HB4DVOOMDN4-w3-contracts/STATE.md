---
phase: finalize
parent: U-AC4HHMUS5PO43H3U
owner:
  - claude
created: 2026-11-01
success_criteria:
  - 'npm run ci exits 0 with the contracts in place: run.ts, overrides.ts, replay/log.ts, reporter/types.ts and stubs, docs/EVENTS.md'
  - client/setup.ts builds its Match through match/run.ts (viewer and reporter build identical Matches)
  - doctrine noise is 0.05 for both presets and golden.ts is regenerated and committed
  - log, run, overrides and layering tests are green and pin no gameplay
---

# slice/w3-contracts

## Purpose
Fix the final shapes of the wave 3 reporter (GameSpec, overrides, log codec, reporter types and stub signatures) so the step-2 slices can fill in the stubs in parallel.

## Scope
In: src/match/run.ts, src/content/overrides.ts, doctrine noise, src/replay/log.ts, src/reporter/types.ts and stubs, client/setup.ts delegation, docs/EVENTS.md (closes B-5BDTUBBCCH4CMW6S), knip, .gitignore, tests, golden.
Out: pool, metrics, stats, html, table, view, CLI behaviour (step 2).

## Context & constraints
Pure dirs follow the purity scan (no Math.* beyond the exact ones). No gameplay-pinning tests (D-4E4QRJ7N6LIGZDSD). Plain git, never push.

## Now
Done; waiting for the lead to merge and close.

## Next
- lead merges the branch and closes the slice

## Evidence
- `npm run ci` exit 0: node 39 files / 574 tests, browser 12 files / 81 tests.
- Director-mode `runGame`, noise 0.05, hold-the-line x4, seeds 1-20: median 159 ms/game, mean 158 ms, avg 9,270 ticks; 20 distinct hash sequences out of 20 seeds.
- golden.ts regenerated (doctrine noise 0.05 moves the Match digests).

## Harvest
- [ ] process: the brief's knip entry `src/reporter/cli.ts!` is redundant (the package.json `bhd` script already makes it an entry), so only `worker.ts!` was added; the unwired stubs and `types.ts` exports are in knip `ignore`/`ignoreIssues` with a comment. Each step-2 slice removes its stub's line.
- [ ] decision: `Mode` now lives in match/run.ts and client/config.ts re-exports it. The spec <-> ViewerConfig mapping (`specFromConfig`, `configFromSpec`) is in client/setup.ts, since match/ must not import the client.
- [ ] decision: `src/replay` added to PURE_DIRS in test/purity-scan.ts (and REQUIRED_DIRS in purity.test.ts).
- [ ] decision: header `end.reason` is `EndReason | 'maxTicks'`; `resolved.director` is absent in schedule mode.
- [ ] decision: overrides: a `director` patch without director mode throws; doctrine `weights` may be added for keys of `bots.kitWeights`; only arrays of `{id}` are id-patchable (master costs and mix are keyed by `def`, so they are replaced whole).
- [ ] decision: types.ts fixes `ResolvedSide`, `RunJob`/`RunDone`/`RunFailed` (PoolMsg), `RunRecord`, `BatchPlan`/`BatchResult`/`Timing`, `ReportInput`/`ReportOptions` beyond what the design table names; `loadLog` in ReportInput lets stats call divergence without fs.
- [ ] backlog: `heal` events still carry no tags (B-ZWLSW3BITMQHPOLW), unchanged.
- [ ] learning: JSON.stringify already writes -0 as 0, so the codec's -0 rule is free; the replacer only guards non-finite numbers.

## Log
- 2026-11-01 initialized
- 2026-11-01 execute: run.ts, overrides.ts, log.ts, types.ts and stubs, EVENTS.md, tests, golden; ci green
- 2026-11-01 finalize: evidence recorded, slice left open for the lead
- 2026-11-01 phase execute → finalize
