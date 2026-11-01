---
phase: finalize
parent: U-AC4HHMUS5PO43H3U
owner:
  - claude
created: 2026-11-01
success_criteria:
  - npm run ci exits 0 with replay/verify.ts, the client replay mode and reporter/view.ts in place
  - config hash round-trips `log` and `tick`; `verifyHashes` finds the first mismatching checkpoint (invariant tests, no gameplay pins)
  - a browser test replays a synthetic log in the viewer and shows "replay verified", and shows "diverged at tick T" for a tampered log
  - '`runView` serves the viewer on the log''s code with /__bhd/log decompressed, and the page opens paused at tick-60, verified'
  - the viewer without `log` behaves as before (existing viewer tests unchanged and green)
---

# slice/w3-replay

## Purpose
Make any logged game replayable in the debug viewer: rebuild the Match from the log header, fast-forward to just before a tick, and verify the live state hashes against the log (wave 3 DESIGN "Replay links", 5f).

## Scope
In: src/replay/verify.ts, src/reporter/view.ts (`runView`), src/client/{config,app}.ts, a new src/client/replay.ts (state and banner text), a banner style in index.html, vite.config.ts BROWSER_TESTS entry, tests.
Out: CLI wiring of `bhd view` (cli slice), the runner's snapshots (runner slice), report links.

## Context & constraints
src/replay is in the purity scan. Node code only in src/reporter. No gameplay assertions (D-4E4QRJ7N6LIGZDSD). The viewer without `log` must not change. Plain git, never push.

## Now
Implemented; ci green. Waiting for the lead to merge.

## Next
- lead merges; cli slice imports `runView` and drops view.ts from the knip `ignore` list

## Evidence
- `npm run ci` exit 0: node 40 files / 580 tests, browser 15 files / 87 tests (was 39 / 574 and 12 / 81).
- End to end, throwaway script (`runGame` seed 3, encodeLog, gzip into `.bhd/demo.ndjson.gz`, header ref WORKTREE; 10,219 ticks):
  - `runView({logPath, tick: 5000, port: 5199, open: false})` printed `bhd view: http://localhost:5199/#log=/__bhd/log&tick=5000`.
  - `curl localhost:5199/__bhd/log` returned the decompressed NDJSON (5,188 lines, header first); `curl /` returned 200.
  - Headless chromium on that URL: banner "replay verified (log fb6a75f+dirty) · 164 checkpoints, through tick 4920", `#tick` 4940 (5000 - 60), "(paused)", no page errors.
  - SIGINT closed the server and the process exited.
- Browser test: synthetic 400-tick log opens at tick 240 for `tick=300`, verified; a log with the 4th hash tampered shows "diverged at tick 120".

## Harvest
- [ ] decision: `ViewerConfig` gained optional `log` and `tick`; a tick without a valid log is dropped; the log must be a path on this origin, `./`, http(s) or blob (not `javascript:` or `data:`).
- [ ] decision: editing any config control in a replay leaves replay mode (drops `log`/`tick` from the hash and starts a live game); Reset re-runs the replay.
- [ ] decision: new file src/client/replay.ts (not in the slice's file list) holds replay state, fetching and banner text so app.ts stays small; `index.html` got three banner CSS lines and `vite.config.ts` the new browser test.
- [ ] decision: `runView` loads no vite.config.ts (`configFile: false`), since the root config pulls in vitest and playwright; it resolves the code root from the header: `ref === 'WORKTREE'` is the repo, else `.bhd/snap/<sha>` (must hold `index.html` and `src`, else a clear error). Runs until SIGINT/SIGTERM.
- [ ] decision: `view.ts` stays in knip `ignore` until the cli slice imports `runView`; its helpers are not exported.
- [ ] process: cannot show `bhd view` through the CLI yet (cli slice); the demo used a script that calls `runView`.
- [ ] backlog: a `+dirty` WORKTREE log replays on the current working tree, not the tree that made it; the verify banner is the only guard (the fingerprint could be compared too).

## Log
- 2026-11-01 initialized
- 2026-11-01 execute: verify.ts, config log/tick, client replay mode, runView, tests; ci green; e2e demo done
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
