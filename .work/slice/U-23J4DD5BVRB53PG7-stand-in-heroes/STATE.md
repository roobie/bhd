---
phase: finalize
parent: U-UKXAXH6M7EWBHXWC
owner:
  - claude
created: 2026-11-01
success_criteria:
  - Three parameterised stand-ins (tank, ranged, support) with basic attacks and generic abilities (taunt, mark, heal pulse, pull); no resources
  - Clearly marked as placeholders in code and content
  - Tests per ability; npm run ci green
---

# slice/stand-in-heroes

## Purpose
Slice 1d: placeholder heroes so a 4-hero team exists.

## Scope
In: heroes/standins.ts, content/heroes/standins.ts
Out: real hero kits (wave 6 design checkpoint with B)

## Context & constraints
Owns only its files in the wave DESIGN ownership table (.work/wave/U-UKXAXH6M7EWBHXWC-w1-content-combat/DESIGN.md). Runs in a worktree in parallel with its sibling.


## Now
Criteria verified against Evidence; harvested; closing.

## Next
- Close.

## Evidence
- Tank taunt, ranged mark, support heal pulse + pull (clumped), all PLACEHOLDER, no resources; cooldowns in kit state (hashed); autocast honoured.
- test/standins/standins.test.ts: 20 tests (taunt vs real enemy aggro, mark 20 -> 17 vs brute, heal caps and skips Ancient, pull then line hit 129 vs 99, cooldown exact to the tick, attack period exact = ticks(1)).
- Golden regenerated (kit hash gained cooldowns). npm run ci: 325 node + 75 browser tests green.

- Review fixes: heal with nobody hurt and pull with no enemy in radius now return no-cast (no cooldown spent, no event); `?.` dropped from hashStandin and test/sim/hash.test.ts now perturbs real stand-in and Gunner kits (swapping in the other kind's real kit for `kit.kind`), covering cooldowns; autocast now runs before the cooldown countdown so it leaves the same cooldown as a manual cast. `npm run ci` green (352 node + 75 browser).
- Re-review follow-up: added autocast-heal-with-nobody-hurt no-op test; leash invariant tests in test/lane/enemies.test.ts. `npm run ci` exit 0.

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [x] learning (fixed): test/sim/hash.test.ts relabelled the Gunner's kit as 'standin', so hashStandin must tolerate a kit without cooldowns (`?.`); better to perturb a real stand-in hero there.
- [x] backlog: enemies.ts attack cooldown has the same decrement-then-return off-by-one (period ticks+1) as the old stand-in attack; test/sim/heroes.test.ts also encodes +1 for the Gunner.
- [x] backlog: wave 3 may want a dedicated pull intent / bot hook; stand-in autocast pull aims at the nearest hostile.

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 implemented stand-in attack/abilities/tests
- 2026-11-01 review fixes applied; owner scope change: only no-op-in-state invariants tested for failed casts, no tuning-pinning tests
- 2026-11-01 re-review follow-ups: autocast heal no-op test, leash invariant tests
- 2026-11-01 phase execute → finalize
