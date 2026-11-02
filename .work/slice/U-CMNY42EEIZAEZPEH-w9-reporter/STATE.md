---
phase: finalize
parent: U-IUFI7QQSGH4543TP
owner:
  - claude
created: 2026-11-02
success_criteria:
  - bargain.* metrics compute from synthetic bargain event logs and are registered (test/reporter/bargain-metrics.test.ts)
  - ancientViolations(log) flags non-leak Ancient damage and is a metric (bargain.ancientViolations)
  - scenarios/bargains-{decline,accept}.json set bots.bargain.policy and apply once defaults carry the keys
  - npm run ci exits 0
---

# slice/w9-reporter

## Purpose
Reporter metrics for bargains: accept/decline/expire rates, Ancient heals, extras, attributed costs, and the Ancient-only-leaks invariant check.

## Scope
In: src/reporter/metrics/bargain.ts, registry, docs/METRICS.md, scenarios/bargains-*.json, test/reporter/bargain-metrics.test.ts.
Out: sim engine, pool, bots.

## Context & constraints
No gameplay pinning. Overrides cannot add keys the base lacks.

## Now
Done; in finalize.

## Next
- Integrator: add `bargains` to defaultGame and `bargain: {policy:'evaluate'}` to defaultBotSetup; run ancientViolations over batch logs.

## Evidence
- npm run ci exit 0 (log w9-E-ci.log in the scratchpad).

## Harvest
- [ ] backlog: overrides cannot add absent keys; a bargains override would need that, or the defaults must carry them (step 3).

## Log
- 2026-11-02 initialized
- 2026-11-02 built metrics, invariant, overrides, docs, tests; CI green
- 2026-11-02 phase initialize → execute
- 2026-11-02 phase execute → finalize
