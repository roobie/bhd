---
phase: execute
parent: U-DF7K3YRYWDWAAWOY
owner:
  - claude
created: 2026-11-01
success_criteria:
  - Match.setDriven hands heroes between human and bots deterministically via commands
  - Bots skip abilities whose autocast bit is off; bits on for bots, off on human takeover
  - N key and HUD button emit callWave; HUD shows time to next wave
  - Fallen heroes show a respawn countdown on their card
  - app.ts accepts an optional FeedbackSink (feedbackSink.ts)
  - npm run ci exits 0; screenshots at 390x844 and 1280x720 are unclipped
---

# slice/w8-solo-loop

## Purpose
Make the solo loop playable: pick any hero to drive, bots take the rest, call waves early, see respawn timers.

## Scope
In: match.ts, run.ts, client shell app/controls/config/hud/hudmodel/input, feedbackSink.ts.
Out: scene/snapshot, content presentation, bot brains.

## Context & constraints
Step 1 landed hooks, callWave command, Perception.fallen.


## Now
Implementing.

## Next
- Finalize

## Evidence
- npm run ci exit 0 (log w8-D-ci.log, with golden regenerated locally and reverted before commit).
- Screenshots in scratchpad w8-D/ at 390x844 and 1280x720 (call button, respawn countdown); top bar and card badges fixed.
<!-- Proof against success_criteria: test runs, commits, measurements. -->

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->

## Log
- 2026-11-02 implemented setDriven, autocast sync/filter, call wave, respawn countdown, FeedbackSink seam
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
