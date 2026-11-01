---
phase: finalize
parent: U-AC4HHMUS5PO43H3U
owner:
  - claude
created: 2026-11-01
success_criteria:
  - parseCli (node:util parseArgs) accepts report/run/view/clean/help, fills defaults, and returns a usage message for bad input; test/reporter/args.test.ts green
  - commands.ts wires runBatch -> buildReport -> report.json + index.html -> renderTable, with progress and ETA on stderr
  - npm run bhd -- help prints usage; exit codes 0 / 2 / 1
  - npm run ci exits 0
---

# slice/w3-cli

## Purpose
Give the reporter its command line: argument parsing and the glue from a command to a written report.

## Scope
In: src/reporter/{cli,args,commands}.ts, package.json bin, test/reporter/args.test.ts, knip ignore lines.
Out: side resolution and scenarios (runner slice), metrics, stats, rendering, view.

## Context & constraints
No gameplay-pinning tests (D-4E4QRJ7N6LIGZDSD). Plain git, never push. Stubs from other slices are called by signature only.

## Now
Done; waiting for the lead to merge.

## Next
- lead wires `resolveSide` and `loadScenario` (Deps in commands.ts) into cli.ts when the runner slice lands

## Evidence
- `npm run ci` exit 0: node 40 files / 585 tests, browser 12 files / 81 tests.
- `npm run bhd -- help` prints usage (exit 0); `bhd report` without --base prints usage (exit 2); `bhd clean` works.

## Harvest
- [ ] decision: side resolution and scenario loading are injected as `Deps` (`resolveSide`, `loadScenario`) because sides.ts/scenarios.ts are the runner slice's and did not exist; cli.ts passes rejecting placeholders. Integration replaces them.
- [ ] decision: `parseSideSpec` lives in args.ts (pure); the runner slice's sides.ts may reuse it instead of its own parser.
- [ ] decision: `--games N` is games per side, turned into seeds.count = ceil(N / lineups); with `--scenario` the file's seeds win and --games is ignored.
- [ ] decision: keys: runs dir `.bhd/runs/<hash(scenario, side identities)>`, report dir `.bhd/reports/<hash(runKey, tags)>` unless `--out`.
- [ ] backlog: `bhd run` has no single-side batch; it plays the side as base and as a copy named cand (same run keys, so double work or a cache-hit race). runBatch could take an optional cand.
- [ ] decision: knip `ignore` keeps only metrics/registry.ts (computeMetrics has no importer until worker.ts calls it); the other stub lines are gone since commands.ts imports them.
- [ ] process: bin points at a .ts file with a shebang; relies on Node type stripping.

## Log
- 2026-11-01 initialized
- 2026-11-01 execute: args, commands, cli, tests; ci green
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
