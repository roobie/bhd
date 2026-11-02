---
phase: execute
parent: U-RTZB3ZJZRHUYJYR5
owner:
  - B
  - claude
created: 2026-11-01
success_criteria:
  - npm run ci green locally and on GitHub; bargain events identical across runtimes
  - All-bot games offer, evaluate, accept and decline bargains through commands only
  - 'Solo on play.html: offers appear after waves 3, 6, 9 and 12 with visible costs; accept, decline and lapse all work'
  - No path hurts the Ancient; its hp drops only through leak damage (invariant over batch logs)
  - The six-bargain pool from B is live; declining heals the Ancient 4%
  - Three-policy reporter batch (evaluate, declineAll, acceptAll) reviewed with B
---

# wave/w9-bargains

## Purpose
Add bargains (relics with a gain and a cost on another axis; declining is valid) per DESIGN 9a, within D-2PNKLSQWVJEBSWPI (the Ancient is never hurt).

## Scope
In: PLAN.md steps 1-3 (engine prep; slices A sim, B pool, C bot evaluator, D HUD, E reporter; integration and batch).
Out: scars (D-ZAQVH22UMUMFOQBV), multiplayer seat ownership (wave 10), permanent Brace kit flag.

## Context & constraints
No gameplay pinning (D-4E4QRJ7N6LIGZDSD). Determinism is cross-runtime equality (D-V4TA7WE5J4QC24D3). Sonnet implements in worktrees, Opus reviews, only the lead pushes.


## Now
Step 1 engine-prep contract in progress.

## Next
- Step 2 slices A-E in parallel.
- Step 3 integration and three-policy batch.

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->
- Step 3 integration: npm run ci exit 0. 100-pair batches (quick vs 6a9b06d; evaluate vs declineAll; evaluate vs acceptAll). bargain.ancientViolations 0 in all three and over 240 full logs. outcome.wave: base 14.58, evaluate 14.21, declineAll 14.60, acceptAll 14.31. ancientHp[end]: base 0.283, evaluate 0.205, declineAll 0.267, acceptAll 0.323. evaluate accept rate by card (of games offering it): iron-discipline 1.00, hair-shirt 0.47, open-the-eye 0.34, blood-tithe 0.006, unvented-barrel 0, call-the-horde 0. Evaluate declines 0.33 of offers (0.18 at w3, 0.60 at w9, 0.84 at w12); expiry 0.
- Fix pass after Opus review (H1 Gunner bot after Iron Discipline, H2 additive units via EffectView.base, M1 Spent armour, M2 mode-bound effects, L1-L5, L7): npm run ci exit 0. 100-pair batches, base 6a9b06d, candidate WORKTREE with each policy; reports in the session scratchpad w9-fix/. bargain.ancientViolations 0 in all three. outcome.wave: base 14.58, evaluate 14.49, declineAll 14.60, acceptAll 14.44. ancientHp[end]: base 0.283, evaluate 0.207, declineAll 0.267, acceptAll 0.365. evaluate accept rate by card (of games offering it): iron-discipline 1.00, hair-shirt 0.53, open-the-eye 0.40, call-the-horde 0.31 (director mode: its waveExtra cost no longer reaches the bot), blood-tithe 0, unvented-barrel 0. Evaluate declines 95 of 296 offers (0.32), expiry 0. acceptAll takes each card in 0.48-0.68 of the games offering it. team.ff gunner>penitent -38% vs base under evaluate (the bot now fires freely once Iron Discipline spares allies).

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] backlog: evaluate never takes unvented-barrel or blood-tithe and always takes iron-discipline. The first batch also hid real bugs (Gunner bot ignored overpenAllies 0, additive patches in the wrong unit, a cost from the other wave mode counted); those are fixed, what remains is pool and weight tuning to bring accept rates into the PLAN 15-85% band
- [ ] decision: B (2026-11-02) chose all recommendations: offers after waves 3/6/9/12, 3 cards + Decline, 20 s window, clock keeps running (B1); team offer, hero-bound cards, benefiting hero's player accepts, solo picks all with opt-in bots-pick, wave master gets budget (B2); wide costs (self, teammates, enemy side), permanent (B3/B4); the six-bargain pool in PLAN §B5 (B5); decline heals the Ancient 4% (B6)

## Log
- 2026-11-02 step 3 integration: bargains on in defaultGame/defaultBotSetup, solo bargainPolicy + shell toggle, shared effectiveDef, card text, evidence, screenshots
- 2026-11-01 initialized
- 2026-11-02 Opus plan; B answered all design questions
- 2026-11-02 phase initialize → execute
