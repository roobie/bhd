---
phase: finalize
parent: U-DF7K3YRYWDWAAWOY
owner:
  - claude
created: 2026-11-01
success_criteria:
  - foldPayoffs / createPayoffTracker find cash-ins (Marked, Exposed, Clumped) and wombos on synthetic event streams (test/perception/payoffs.test.ts)
  - createFeedback implements onStep/visualTime; visual time is monotonic and never ahead of real time (test/client/shell/feedback.test.ts)
  - audio is a silent no-op without AudioContext and when it throws
  - scene draws status rings, the Pavise look, backlash and nova effects; screenshots in scratchpad w8-E
---

# slice/w8-feedback

## Purpose
Payoffs are a loop and should feel like one: callouts, hitstop, stings and status visuals (design pillar 2).

## Scope
In: src/perception/payoffs.ts, src/client/shell/feedback.ts, src/client/audio.ts, scene.ts, snapshot.ts, tests.
Out: app.ts wiring (lead, step 3), hud, controls.

## Context & constraints
Local FeedbackSink shape, not imported from slice D. One-line edit to types.ts (Effect kinds).

## Now
Done; at finalize.

## Next
- Lead wires feedback into app.ts.

## Evidence
- Unit tests green (node project); CI log w8-E-ci.log.
- Screenshots: scratchpad/w8-E (local uncommitted app.ts wiring, reverted).

## Harvest
- [ ] learning: hitstop makes the visual clock lag real time up to 200 ms; pass visualTime to advanceEffects as well as buildScene or effects spawned during a freeze start invisible for a moment.

## Log
- 2026-11-01 initialized
- 2026-11-02 implemented, tested, screenshots
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
