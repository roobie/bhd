---
phase: finalize
parent: U-DF7K3YRYWDWAAWOY
owner:
  - claude
created: 2026-11-01
success_criteria:
  - Pavise (3 wide, range 6, 8 s, 16 s cooldown) is aimed by point, perpendicular to Gunner->point, and clips her overpen line while it stands
  - Gunner bot has a gunner.pavise decision (wait | shield | block) with explicit cooldown and reach-loss costs
  - Perception exposes her standing Pavise (GunnerView.pavise); invariant tests pass; CI exits 0
---

# slice/w8-pavise

## Purpose
Finish the Gunner's Pavise (decision D-XVHJGA432FCOHEEU): aimed cast, barrier clipping, bot decision, perception.

## Scope
In: gunner sim/content/perception/bot and their tests; the Gunner entry of kit weights.
Out: enemies.ts, shared engine, UI.

## Context & constraints
Step 1 landed a basic Pavise; enemies.ts melee already checks firstBarrier with the enemy team.

## Now
Finalize.

## Next
- Integrator: regenerate golden.

## Evidence
Tests: test/gunner and test/bots/gunner.test.ts pass; CI log w8-C-ci.log.

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] decision: Pavise accepts its aim point while braced (cones still use the brace facing).
- [ ] backlog: the `suppressed` slow status and its combo/colour entries are now unused by any kit.

## Log
- 2026-11-01 initialized
- 2026-11-02 executed
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
