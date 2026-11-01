---
phase: finalize
parent: U-AC4HHMUS5PO43H3U
owner:
  - claude
created: 2026-11-01
success_criteria:
  - all 13 metrics registered in src/reporter/metrics/registry.ts
  - synthetic-log tests green; all metrics finite over one real runGame log
  - npm run ci exit 0
---

# slice/w3-metrics

## Purpose
Turn a finished GameLog into the per-game series values the reporter diffs (wave 3 DESIGN, metrics registry, slice 2b).

## Scope
In: src/reporter/metrics/*.ts, docs/METRICS.md, test/reporter/metrics.test.ts, knip ignore line.
Out: pool, stats, html, cli, view; no gameplay assertions.

## Context & constraints
Contracts in src/reporter/types.ts (MetricDef, GameLog) stay as they are. Plain git, never push.

## Now
Done; waiting for the lead to merge and close.

## Next
- lead merges the branch and closes the slice

## Evidence
- `npm run ci` exit 0: node 40 files / 590 tests, browser 12 files / 81 tests.
- Metrics over one real director-mode log (5,187 events, 237 series): 15 ms first call (cold JIT), 3-5 ms warm.
- Registry holds 15 MetricDefs for the 13 metrics (ability and intent have two each).

## Harvest
- [ ] decision: metrics 8 and 10 are two defs each (`ability.casts`/`.value`, `intent.fulfil`/`.latency`) because a MetricDef has one id and one `missing`; no shape change in types.ts.
- [ ] decision: `combo.rate` keys are `<kind>:w<n>` (fulfil count) and `<kind>:w<n>:payoff` (value of the fulfilling hero's latest cast at or before the fulfil tick).
- [ ] decision: per-wave metrics (`outcome.leaks`, `outcome.ancientHp`, `team.lowestHp`, `combo.rate`) use missing=skip, so a game that ends earlier does not count unreached waves as 0; counts and shares use zero.
- [ ] decision: team hp = sum of hero hp / sum of hero max hp, heroes only (the Ancient is `outcome.ancientHp`). A leaked or dead entity counts as hp 0 and leaves the alive-enemy count.
- [ ] decision: ultimate slot comes from a kit table (gunner 3), else the hero's highest ability slot (stand-ins).
- [ ] learning: a `leak` removes the enemy without a `death` event, so alive-enemy tracking must handle `leak` too.
- [ ] process: knip complains about exported-but-unused helpers inside the metrics dir; keep them module-private.

## Log
- 2026-11-01 initialized
- 2026-11-01 execute: metrics, docs/METRICS.md, tests; ci green
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
