---
phase: finalize
parent: U-Z5DSPXUKSXQ6FD7Z
owner:
  - claude (agent)
created: 2026-11-01
success_criteria:
  - 'ci green (npm run ci exits 0)'
  - 'support posts pull intents at the clump point (intentKind pull) instead of casting a good clump directly'
  - 'tank costs standing in the Gunner line (standin.tank.stand.inGunnerLine) and decides taunts; ranged chooses mark target and timing; support chooses heals'
  - 'brain is deterministic, emits only canonical command shapes, reads only BotCtx (invariant tests)'
  - 'watched in viewer (lead, step 3)'
---

# slice/standin-bots

## Purpose
One utility brain for the three placeholder stand-in roles, so the 4-hero team plays on bots (wave w2-bots).

## Scope
In: `src/bots/standins.ts`, `src/content/bots/standins.ts`, `test/bots/standins.test.ts`.
Out: perception, Match, intents board, the Gunner brain.

## Context & constraints
Bots import only commands/events/time and perception types from the sim side. Weights are data with the content defaults as fallback. Decision ids `standin.<role>.<decision>`.

## Now
Done; awaiting lead integration and the viewer watch.

## Next
- Lead: merge, `npm run golden`, tune in the viewer.

## Evidence
- `npm run ci` exit 0 (see Log).
- Tests: test/bots/standins.test.ts, 5 invariants (determinism, purity on ctx copies, no mutation, command shapes, weights fallback).
- Qualitative headless all-bot Match, seed 7, master game + Director, 4 seats on one doctrine (no asserts):
  - hold-the-line: ended tick 4970; mark 12, taunt 4, heal 5, pull intents posted 1, fired 1, expired 0, direct pull casts 0 (the one `pull` ability event is the fired intent).
  - greedy: ended tick 4712; mark 14, taunt 6, heal 3, pull intents posted 1, fired 1, expired 0.
  - Pull intents are rare: a good clump (`standin.support.pull.minClump` = 4) seldom forms in these games. Tuning candidate.

## Harvest
- [ ] decision: one brain dispatching on `me.role`; the Gunner line is derived privately (her position + target, `standin.line.range/halfWidth` weights), not from `lineAllies`, so any candidate spot can be costed, not only the current one.
- [ ] decision: line cost is scaled by `(1 - 0.6 * risk)`; forward spots pay `danger * threat * (1 - risk)`; aggression scales value of front/forward spots, taunts, marks and pulls.
- [ ] decision: pull posting is gated by "no live intent by me and none in flight"; a smaller clump (2..minClump-1) is cast directly at a discount.
- [ ] decision: brain falls back to `standinWeights()` defaults for absent keys, so tests with `kitWeights: {}` behave the same.
- [ ] learning: pull fire lead (`fireInSeconds` 1.5) must exceed think + reaction of the Gunner (0.5 + 0.4 s) to give her time to reserve.
- [ ] backlog: tune `minClump` / clump radius so pull intents occur more often; ranged has no attack-target command, so "target choice" is the mark target only.

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize -> execute
- 2026-11-01 built brain, weights, tests; golden regenerated
- 2026-11-01 phase execute -> finalize
