---
phase: execute
parent: U-DF7K3YRYWDWAAWOY
owner:
  - claude
created: 2026-11-01
success_criteria:
  - 'gameindex accounts several downs per hero, total downtime and respawn count; time-in-state metrics count alive time only'
  - 'ULT_SLOT covers penitent and psyker'
  - 'per-kit metrics exist for Pain, nova, Warp, backlash and Pavise, with documented event assumptions'
  - 'bhd report HEAD vs WORKTREE runs end to end on the new lineup'
---

# slice/w8-reporter

## Purpose
Get the reporter ready for the solo-playable kits (respawn, Penitent, Psyker, Pavise) before they land.

## Scope
In: src/reporter/metrics/{gameindex,hero,gunner,registry,penitent,psyker}.ts, docs/{EVENTS,METRICS}.md, tests.
Out: metric 9 stays on the intent proxy (slice E owns payoffs.ts; the lead decides at integration).

## Context & constraints
Metrics live in src/reporter/metrics (the plan's src/metrics paths). Kits are built in parallel: assumptions are in docs/METRICS.md.

## Now
Finalize.

## Next
- Integrator reconciles the event assumptions (Pavise block event, Pain amounts, Warp band values).

## Evidence
- test/reporter/kit-metrics.test.ts; npm run ci exit 0 (log in the scratchpad, w8-G-ci.log).
- `bhd report --base HEAD --games 2`: exit 0, under 1 s wall (cached/small), 111 series untested for too few pairs.

## Harvest
- [ ] backlog: the sim logs no event for a blocked hit, Pain amounts or backlash rolls; add events or tags so the metrics stop estimating.

## Log
- 2026-11-01 initialized
- 2026-11-02 implemented, tested
