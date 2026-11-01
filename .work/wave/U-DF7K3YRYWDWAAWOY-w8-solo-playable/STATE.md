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
Step 1 (engine prep) running.

## Next
- Step 2 slices A–G in parallel after step 1 integrates.
- Step 3 integration, golden regen, 8d reporter review with B.

## Evidence

## Harvest
- [ ] decision: B (2026-11-01): Psyker basic-attack hits add Warp (about +4); Martyrdom nova hits enemies only (PLAN §3 Q1, Q2)

## Log
- 2026-11-01 initialized from Opus plan
- 2026-11-01 phase initialize → execute
- 2026-11-01 B answered PLAN §3 Q1/Q2 (Warp from basic attacks; nova enemies only), matching the step-1 knob defaults
