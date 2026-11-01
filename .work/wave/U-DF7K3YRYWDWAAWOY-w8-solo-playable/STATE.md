---
phase: execute
parent: U-RTZB3ZJZRHUYJYR5
owner:
  - B
  - claude
created: 2026-11-01
success_criteria:
  - npm run ci green locally and on GitHub; golden regenerated deliberately by the lead only; hash test covers all four kits and props
  - 'Solo: on play.html the player takes over any of the four heroes and bots drive the rest; switching hands control back and forth'
  - Penitent Pain, Chain of Penance and Martyrdom (nova, Spent) visible in HUD and events; FF never takes him below 1 hp during Martyrdom; heals on him are x0.25
  - Psyker Warp and backlash chance always shown; Lash pulls and applies Clumped; backlash rolls only on the kit stream
  - Pavise stops the Gunner overpen line and enemy hits behind it
  - In all-bot games the Martyrdom wombo (pull, Martyrdom, Furnace Heart) fires at least once on most seeds
  - Dead heroes respawn on a wave-scaled timer; a team wipe does not end the game, only Ancient death does
  - Effective leash is about 10
  - Call next wave works by button and key on every wave, via command()
  - Combo callouts, hitstop, status visuals and sound stings show in the client and never change the sim hash
  - 8d reporter batch across the new lineup has run and been reviewed with B
---

# wave/w8-solo-playable

## Purpose
Make M2 solo-playable with B's signed-off kits (w6 decisions): Penitent P1 and Psyker Y1 reduced kits, Gunner Pavise, the Martyrdom wombo, respawn, call-early, leash, and payoff feedback.

## Scope
In: PLAN.md steps 1–3 (engine prep; slices A Penitent, B Psyker, C Pavise, D solo loop, E feedback, F UI content, G reporter readiness; integration and 8d).
Out: full kits (B-7YXA5H4O3R2J4NG2), Rift (B-C4AZ5S2JPOP24OUM), bargains (wave 9), multiplayer (wave 10), sprites (B-4CHV2DXEODTEOQLE).

## Context & constraints
Decisions D-IL3SV332IUGDBPFW, D-ENVNBTY5YVUM7NAN, D-4TKP7DQRMLBK6K7W, D-XVHJGA432FCOHEEU, D-EVOB2RC2MXQWJYBE, D-MFT4K7D4HC3TOYPH, D-2BOISI7VSLW2ZX3F, D-ZAQVH22UMUMFOQBV, D-IYLBKMAIQNR7GE3R, D-H2FHQUWM3IJDUPCU, D-ZQ7UANKFTPZIMMZW. No gameplay pinning (D-4E4QRJ7N6LIGZDSD). Sonnet implements in worktrees; Opus reviews; only the lead pushes and regenerates golden.

## Now
Step 3 integration done and green: cross-runtime check, step-1 review fixes, wiring, evidence runs, screenshots.

## Next
- Step 2 slices A–G in parallel after step 1 integrates.
- Step 3 integration, golden regen, 8d reporter review with B.

## Evidence
- 2026-11-02 `npm run ci` exit 0 after step 3 wiring (log in scratchpad w8-int-ci.log); node 906 tests, browser 129 tests x3 browsers
- 2026-11-02 all-bot games, 12 seeds each (scratchpad w8-int/evidence.ts, not asserted in tests): director mode 88 pull posts, 26 reservations, 18 fulfils, 2 wombos (seeds 2 and 9) by foldPayoffs, 517 cash-ins; 10 of 12 lost at wave 14-15, seeds 3 and 11 won. schedule mode (hold-the-line): 72 posts, 12 to 36 reservations, 0 fulfils, 0 wombos, all lost at wave 12. schedule (greedy): 168 posts, 24 reservations, 0 fulfils.
- 2026-11-02 schedule-mode wombo shortfall diagnosed, no clear bot bug: first pull's Lash finds the clump gone after its 4.5 s lead; later pulls fire but Martyrdom is on cooldown and the Gunner's reserved Furnace overheats first (a heat gate on the reservation only removed reservations, so it was reverted)
- 2026-11-02 screenshots at 390x844 and 1280x720 in scratchpad w8-int/: normal game at 90 s, callout, help for Penitent and Psyker, downed countdown; no clipping found
- 2026-11-02 review fixes: master callWave proven by a node spec (engine-hooks) and the master scenario script (callWave at its tick starts the pending wave); full CI and screenshots in scratchpad w8-fix/

- 2026-11-02 Pavise self-blocks fix (100-game reporter batch, base 57cf014 vs cand, scratchpad pavise-fix): gunner.pavise selfBlocks 39.2 -> 8.1, blocked 40.3 -> 41.3, casts 7.6 -> 8.1, outcome.wave 14.36 -> 14.58, outcome.ancientHp[end] 0.215 -> 0.283

## Harvest
- [x] decision: determinism spec is cross-runtime equality at test time, no committed golden (D-V4TA7WE5J4QC24D3, supersedes D-NMSA2YZXKCODLCC2)
- [x] decision: D-ZMXSYC2O7WQ5PHZO (supersedes D-3F64ED62IYC4SCZH): callWave starts the Director's pending wave in master mode under both throttles; shared canCallWave predicate drives sim and HUD; a blocked swing still costs a full attack period
- [ ] decision: B (2026-11-01): Psyker basic-attack hits add Warp (about +4); Martyrdom nova hits enemies only (PLAN §3 Q1, Q2)

## Log
- 2026-11-01 initialized from Opus plan
- 2026-11-01 phase initialize → execute
- 2026-11-01 B answered PLAN §3 Q1/Q2 (Warp from basic attacks; nova enemies only), matching the step-1 knob defaults
- 2026-11-02 step 1 engine prep merged; golden regenerated once; step 2 slices opened
- 2026-11-02 step 3: golden.ts/regen.ts/npm run golden removed; browser project gets a Node-computed reference via globalSetup + inject (D-V4TA7WE5J4QC24D3)
- 2026-11-02 step 3: step-1 review fixes (downGunner, callWave throttle, block/despawn events, fallen in team totals, intent drop on down, respawn first, damageTaken clamp)
- 2026-11-02 step 3: feedback mounted in main (overlay layer + camera projection), help gains Resources and Rules, dead cards use respawnText/UI_TEXT, reporter gains combo.payoffs; all-bot evidence and screenshots recorded
- 2026-11-02 review fixes: H1 master callWave starts the pending wave (shared canCallWave/canSend), M1 HUD reads wave.canCall, L1 gunner.pavise split blocked/selfBlocks, L2 combo.payoffs binary search, L3 browser reference guards, UI callouts merge (x N) and cap at 4
- 2026-11-02 bot fix: Gunner kept firing overpenetrating rounds into her own Pavise (barrier between her and the nearest enemy stops the line dead); fire now costs 'gunner.pavise.selfBlock' x line liveness while the barrier is in front of the target, so she holds and the heat falls
