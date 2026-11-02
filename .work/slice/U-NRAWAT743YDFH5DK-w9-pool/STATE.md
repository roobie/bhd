---
phase: finalize
parent: U-IUFI7QQSGH4543TP
owner:
  - claude
created: 2026-11-02
success_criteria:
  - 'defaultBargains() returns the six approved bargains and validates through validateGame'
  - 'pool invariants test passes; npm run ci exits 0'
---

# slice/w9-pool

## Purpose
Ship B's initial bargain pool as content, plus the one kit flag the vocabulary could not express.

## Scope
In: src/content/bargains/pool.ts, its test, gunner overpenAllies flag.
Out: turning bargains on in defaultGame (step 3).

## Context & constraints
CONTRACT.md Effect vocabulary; no gameplay pinning.


## Now
Done; in finalize.

## Next
- Integrator wires defaultBargains() into defaultGame; drop the knip pool.ts ignore then.

## Evidence
npm run ci exit 0 (log w9-B-ci.log).

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->

## Log
- 2026-11-02 initialized
- 2026-11-02 executed: pool + overpenAllies flag + tests; ci 0
