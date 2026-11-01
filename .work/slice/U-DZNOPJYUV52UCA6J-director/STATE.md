---
phase: finalize
parent: U-Z5DSPXUKSXQ6FD7Z
owner:
  - claude (agent)
created: 2026-11-01
success_criteria:
  - npm run ci exits 0
  - Summon/send shape and budget-refusal tests pass (over-budget, locked and out-of-window commands are logged no-ops)
  - Master state is hashed (reflective test over every leaf of a live state)
  - A Director-driven all-bot Match reaches an `end` event within a generous bound (liveness, several seeds)
  - The Director emits only valid summon and send commands, none refused, deterministically
---

# slice/director

## Purpose
Finish the wave master (sim side, hashed) and the Director seat (tension accumulator, build/peak/relax phases, spend mix) so a Director game runs end to end.

## Scope
In: `sim/master.ts`, `director/{director,tension}.ts`, `content/director.ts`, `test/director/`.
Out: perception numbers, bots, viewer, Match.

## Context & constraints
Spec: wave DESIGN. D-4E4QRJ7N6LIGZDSD (no gameplay assertions), D-FZ2FXOOFFRB5P2YL (wave end unchanged). The Director paces for tension and never plays to win.

## Now
Done; criteria hold. Ready for the lead (slice not closed).

## Next
- Lead merges, regenerates golden on conflict, tunes numbers in the watch pass.

## Evidence
- `npm run ci` exit 0: node 476 tests / 29 files, browser 78. Golden regenerated.
- Qualitative run (default content, default bots, seeds 1 and 2; scratch script, not committed). Both games end `ancient-destroyed` (wave 15 at tick 8185, wave 14 at tick 7112) with the stub bots. Tension stayed in build until the heroes collapsed: first peak at tick 5850 / 6360, max tension 1.00, no relax seen (the game ended first). Sends happened only at peak, each at the 10 s minimum interval (seed 1: ticks 5865, 6165, 6465, 6765, 7065). Units bought per wave (seed 1, wave: buys): 1 grunt 8; 2 runner 8 grunt 2; 3 grunt 12; 4 grunt 8 runner 6; 5 grunt 9 brute 3; 6 grunt 6 brute 4; 7 grunt 4 brute 4 runner 4; 8 grunt 12 runner 10; 9 brute 4 grunt 8 runner 4; 10 grunt 8 boss 2; 11 grunt 8 runner 8 brute 4; 12 grunt 4 runner 9 brute 3; 13 boss 3; 14 runner 8 grunt 15 boss 1; 15 grunt 12 brute 7 runner 5. Unlocks hold (runner from 2, brute from 3, boss from 5). Read: in build it spends everything each wave, so tension only rises once the team is already failing; step 3 should tune `damageGain` and the thresholds so peak shows earlier.

## Harvest
- [ ] decision: unlock by wave is `unlockWave` on `MasterDef.costs` entries (sim refuses a def whose unlock is above the wave being bought, `waves.n + 1`); the Director's `mix` entries carry a copy, and both defaults are built from one `ROSTER` table in content/director.ts.
- [ ] decision: tension is `clamp01(max(level, value - decay*s) + lowHeroes*lowHpGain*s)`; level is the windowed damage and leaks, low-hp is per second per hero and uses the Director's own `lowHpFrac`; relax lasts `relaxSeconds` then build (the stub's relax lasted one tick).
- [ ] decision: spend is data: `keepFrac` per phase is the fraction of budget+pending left unspent (build 0, peak 0.25, relax 0.8); a send is issued at peak only if it would apply inside the window `[sendAt, nextAt)`, using the Director's own reaction delay; in-flight summons count against the budget, and a send in flight blocks further commands.
- [ ] learning: `firstDelay` and `interval` in `WaveSchedule` are seconds, `minIntervalSeconds` too; tests that think in ticks must convert.
- [ ] backlog: `MasterView.costs` does not carry unlock waves, so the Director relies on its own `mix.unlockWave`; if content diverges the Director gets refused summons. Add `unlockWave` to the view (perception owner) and drop the copy.
- [ ] backlog: tension only reaches peak when heroes are already collapsing (see Evidence); tune in step 3, possibly with a lower `peakAbove` or a damage-rate driver.

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 sim: unlockWave refusal; director: tension + phases + spend mix; content nits (lowHpFrac used, lowHpGain scaled by seconds, mix vs costs, pacing vs minInterval); tests; golden regenerated
- 2026-11-01 phase execute → finalize
