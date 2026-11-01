---
phase: finalize
parent: U-AC4HHMUS5PO43H3U
owner:
  - claude
created: 2026-11-01
success_criteria:
  - buildReport, renderTable and renderHtml implemented per wave DESIGN; bootstrap, BH, tag, divergence and render tests green; npm run ci exit 0
---

# slice/w3-stats-report

## Purpose
Turn paired per-game metric values into a ranked, noise-filtered ReportData, and render it as a CLI table and a self-contained HTML file.

## Scope
In: src/reporter/{stats,diverge,html,table}.ts, test/reporter/{stats,report}.test.ts, knip ignore lines.
Out: pool, metrics, cli, view, replay (other slices).

## Context & constraints
Contracts in src/reporter/types.ts are fixed. No gameplay assertions. Local VCS only, never push.

## Now
Done; waiting for the lead to merge and close.

## Next
- lead merges the branch and closes the slice

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->
- `npm run ci` exit 0: node 41 files / 604 tests, browser 12 files / 81 tests.
- Sample report rendered from synthetic input to the scratchpad and read: header, sections, outside flag, view commands, choice table and details all present; no script, no external references.

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] decision: no shape changes to types.ts.
- [ ] decision: added test/reporter/synth.ts (shared synthetic-input helpers) beside the two owned test files.
- [ ] decision: stats.ts also exports pairRuns, bootstrapMean, benjaminiHochberg, tagMatches and `reportJson` (the report.json bytes: 2-space JSON plus newline) for the CLI slice; html and table share number formatting; diverge.ts exports firstDivergence and findDivergence.
- [ ] decision: p is the bootstrap two-sided p, 2 min(P(mean*<=0), P(mean*>=0)), unsmoothed (resolution 1/resamples). Every series reuses the same resample indices (one createRng(seed) stream per n). A constant d gives an exact zero-width CI; constant base gives sd 0 and effect 0.
- [ ] decision: divergence is computed for the top 10 movers only. Choice series are also ordinary series and movers.

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 stats, diverge, table, html and tests done; ci green
- 2026-11-01 phase execute → finalize
