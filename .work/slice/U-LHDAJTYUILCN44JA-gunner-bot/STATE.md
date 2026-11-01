---
phase: finalize
parent: U-Z5DSPXUKSXQ6FD7Z
owner:
  - claude (agent)
created: 2026-11-01
success_criteria:
  - npm run ci exits 0
  - The Gunner brain makes choices for stance (free/brace), fire/hold with an explicit ally-in-line cost (gunner.redline.allyInLine), vent, Suppressing Fire and Furnace Heart (per doctrine.ultimate free/spike/combo), plus positioning
  - It reserves Furnace Heart or Vent against a 'pull' intent on the board
  - Invariant tests pass (determinism, valid canonical command shapes, reads only BotCtx); no test asserts what it picks
  - Watched in the viewer (lead, step 3)
---

# slice/gunner-bot

## Purpose
Replace the Gunner probe brain with a utility brain (project DESIGN §6.2: value minus explicit cost, doctrine-weighted) so a bot Gunner plays the Furnace kit and the viewer shows its choices.

## Scope
In: `src/bots/gunner.ts`, `src/content/bots/gunner.ts`, `test/bots/gunner*`.
Out: perception fields, stand-in bots, intents board logic, Match.

## Context & constraints
Wave DESIGN: .work/wave/U-Z5DSPXUKSXQ6FD7Z-w2-bots/DESIGN.md. Codes against the existing `perception/types.ts` only. D-4E4QRJ7N6LIGZDSD: invariant tests only. Bots import only types from sim plus `ticks()`.

## Now
Built; `npm run ci` exit 0. Waiting for the lead to merge and watch in the viewer.

## Next
- Lead: merge, regenerate golden, watch and tune the weights (all in content/bots/gunner.ts).

## Evidence
- `npm run ci` exit 0 (node 463 tests incl. 7 new in test/bots/gunner.test.ts; browser 78). Golden regenerated (the Match section changed with real play).
- Qualitative run, seed 7, default master game + Director, all seats on one doctrine, up to 6000 ticks (script in session scratchpad, not committed; no asserts). "Choice events" = `choice` events for the Gunner (first evaluation plus each pick change):
  - hold-the-line: game ended tick 5124. Choice events: post 3, fire 4, suppress 8, furnace 4, stance 8, vent 11. Gunner casts: brace/unbrace 5, vent 4, suppress 6, Furnace Heart 1. Picks: post hold 3; fire only fire; stance free 5, brace 3.
  - greedy: ended tick 4988 (after the free-furnace cost fix). Choice events: post 12, fire 5, suppress 12, furnace 4, stance 3, vent 10. Casts: vent 4, suppress 7, Furnace Heart 2, no brace. Picks: post hold 6, advance 3, post 3; fire fire 4, hold 1.
  - Reserve (synthetic `pull` intents posted by the support seat every 400 ticks, since the stand-in is still a stub): hold-the-line made 2 reserve commands (reserve choice events 12: none 11, furnace 1); greedy 2 reserve commands. `fulfil` events are 0 because the intents board `reserve` is still a stub in this branch.
  - Stickiness (0.2) keeps pick changes low; no sign of per-think flapping in the small logs.

## Harvest
- [ ] decision: decision ids `gunner.post | stance | fire | vent | suppress | furnace | reserve`; options for stance are the wanted state (`free` | `brace`), commands only when it differs from the current state.
- [ ] decision: all numbers (geometry mirrored from the kit, cone half angles as cosines because bots have no trig, costs) are `gunnerWeights()` keys with the same values as the brain's fallback; a doctrine override by key works.
- [ ] decision: `lineAllies` is empty while the Gunner holds fire (no target), so the brain also estimates the line from hero positions (nearest enemy in range); without it fire/hold would flap. Perception could fill `lineAllies` for the would-be target too (field request, optional).
- [ ] decision: while the Gunner holds any live reservation, casting Vent or Furnace Heart is charged `gunner.reserve.heldAbility`; the board does not say which ability was reserved, so both are held.
- [ ] decision: the brace aim is remembered in brain memory (last think's focus when the brace is first seen braced), because `GunnerView` does not expose the brace facing.
- [ ] learning: the purity scan bans the bare name `window` (even as a local variable).
- [ ] backlog: `GunnerView` could expose brace facing and unbrace state (rooted but not braced is inferred from statuses).
- [ ] backlog: `fulfil` of a reservation untested end to end until the intents board lands; re-run the qualitative reserve count at integration.
- [ ] backlog: when the support stand-in posts real pulls, tune `gunner.reserve.*` offset against the pull duration.

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 brain, weights, invariant tests, golden regenerated, ci green
- 2026-11-01 phase execute → finalize
