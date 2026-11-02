---
phase: execute
parent: U-RTZB3ZJZRHUYJYR5
owner:
  - B
  - claude
created: 2026-11-02
success_criteria:
  - npm run ci green locally and on GitHub; the determinism scenario covers control commands and replayed seals across runtimes
  - Headless 2, 3 and 4 peer harness with seeded jitter and reorder gives identical hash sequences on every peer, equal to replaying the host seals
  - An injected desync is detected at the next hash checkpoint, halts play and yields a dump that `bhd desync` localises
  - 'Two browser tabs on play.html#room=local-* play co-op over real WebRTC (BroadcastChannel signalling): lobby, slot pick, start, pause, call wave, bargains with owner rules, drop hands the hero to a bot'
  - The signalling Worker and Durable Object build and pass unit tests, never deployed by Claude; internet play awaits B's deploy
---

# wave/w10-multiplayer

## Purpose
2-4 player co-op over WebRTC lockstep, the last M2 capability (DESIGN §3).

## Scope
In: PLAN.md step 1 (net contract, R1, control commands, bargain ownership), step 2 slices A signalling, B WebRTC, C lockstep core, D Match seat/policy, E1 lobby, E2 shell integration; step 3 harness, desync tooling, manual two-tab test.
Out: host migration, adaptive input delay, matchmaking, wave-master human seat (wave 11), duplicate heroes, deploying the CF Worker (B only).

## Context & constraints
Star topology with the host as sequencer. Bots are not networked: every peer runs the same Match; seat and policy changes travel as control commands. No gameplay pinning (D-4E4QRJ7N6LIGZDSD). Determinism is cross-runtime equality (D-V4TA7WE5J4QC24D3). Sonnet implements in worktrees, Opus reviews, only the lead pushes.

## Now
Step 1 lead contract.

## Next
- Step 2 slices A, B, C, D, E1, E2 in parallel.
- Step 3 integration, harness, Opus review; ask B to deploy the Worker for internet evidence.

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] decision: B (2026-11-02) chose: one hero per human, bots fill, first-come slot pick, fixed seats (Q1/Q2/Q8); drop hands the hero to a bot, rejoin same seat as stretch, host drop ends the game (Q3); hero-bound cards decided by their owner only, team cards, Decline and bot heroes' cards by any human, first wins, bots-pick toggle hidden in co-op (Q4); anyone pauses, resumes or calls a wave, with a callout naming who (Q5/Q6). Lead took the link-based lobby (Q7).
- [ ] decision: star topology with host sequencer; rule R1 (only the driver submits networked inputs, in seal order); control commands for Match state; sim-level bargain ownership

## Log
- 2026-11-02 initialized
- 2026-11-02 Opus plan; B answered Q1-Q6; phase initialize → execute
