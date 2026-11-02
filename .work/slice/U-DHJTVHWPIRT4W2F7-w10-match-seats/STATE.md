---
phase: execute
parent: U-GLFZ7OIE2B53ZZCA
owner:
  - claude
created: 2026-11-02
success_criteria:
  - bot bargain decider takes only bot-hero cards, plus team cards and Decline under policy bots; accepts submitted as the card hero's slot
  - control commands (drive, bargainPolicy) take effect at the same tick on two Matches and replay
  - a bot never submits for a human-driven slot; test/match/control.test.ts and npm run ci pass
---

# slice/w10-match-seats

## Purpose
Make Match seats safe for co-op: bots resolve only what is theirs (D-VXJDVX4RFRWSLUQB).

## Scope
In: src/match/match.ts, src/bots/bargain.ts, bots/types.ts Option.player, test/match/control.test.ts
Out: shell, src/net

## Context & constraints
Control commands from SYSTEM_PLAYER already applied in Match.step (step 1). Bot state is not hashed.


## Now
Built; CI gate.

## Next
- Lead merge.

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->

## Log
- 2026-11-02 initialized
