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
Step 1 merged (b036d81). Slices A, D, E1 merged (f9b79e8). B, C and E2 are running; C and E2 got the step-1 review relay (H1 bot-card accept rule, H3 TickDriver setPaused/dispose/dump/onNotice, M1 peer command allowlist, M2 R1 wording, M3 networked guard).
Step-3 carry-overs from the step-1 review: H2 wire messages pick/refuse/end (E1 used `lobby` as the pick request; a refusal is local only), M4 add `src/net` lockstep files to the fingerprint, L1 hero-slot constant for drive, L2 hash driven and policy at checkpoints, L3/L4 `start` spec validation and seats vs humans agreement, L6 comment on duplicate heroes, move TickDriver to `src/net/types.ts`.

## Next
- Step 2 slices A, B, C, D, E1, E2 in parallel.
- Step 3 integration, harness, Opus review; ask B to deploy the Worker for internet evidence.

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->
Step 3 integration (slice U-7G37YJDSYFZ2V6CM):
- Two Chromium pages on `play.html#room=local-*` (BroadcastChannel signalling, real RTCPeerConnection), `node test/net/two-tabs.e2e.ts` (outside CI): create, join, both pick slots and see each other's names, start, 600 ticks, pause and resume from the joiner (both halt within the input delay of each other), 21 hash checkpoints identical on both peers, no desync; restart returns both to a fresh lobby, a second game starts; closing the joiner makes the host seal a `control drive` and a bot takes the hero. Screenshots in the session scratchpad `w10-int/`.
- Firefox: the lobby and the WebRTC link work; headless Firefox has no WebGL here, so the shell falls back and no game runs. Not a net failure.
- Bug found only by this run: the shell built the injected driver twice and disposing the first sent `bye` (fixed in app.ts). Second: the HUD root had to be fresh for a second game.
- Determinism scenario gained a sealed-replay segment (seals of a host-style run, drive handovers, a policy flip, a bot hero's card accepted as its slot) compared across Node and browsers; the lockstep harness gained the positive bot-card accept path.
- Review leftovers: H2, M2, M4, L1, L2, L3, L4, L6 resolved; TickDriver moved to `src/net/types.ts`.
- Not verified: a hidden tab (headless cannot show it), over-the-internet play (Worker not deployed).

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] decision: B (2026-11-02) chose: one hero per human, bots fill, first-come slot pick, fixed seats (Q1/Q2/Q8); drop hands the hero to a bot, rejoin same seat as stretch, host drop ends the game (Q3); hero-bound cards decided by their owner only, team cards, Decline and bot heroes' cards by any human, first wins, bots-pick toggle hidden in co-op (Q4); anyone pauses, resumes or calls a wave, with a callout naming who (Q5/Q6). Lead took the link-based lobby (Q7).
- [ ] decision: star topology with host sequencer; rule R1 (only the driver submits networked inputs, in seal order); control commands for Match state; sim-level bargain ownership

- [ ] decision: co-op restart is the wire message `end` (host to all; a client asks the host): everyone returns to a fresh lobby over the same links, signalling and room stay up; a late `hello` during a game gets `refuse started`
- [ ] decision: the `lobby` message doubles as the slot-pick request (host reads only entries equal to the sender); `refuse {abi|fingerprint|full|started}` and parallel `names` added, PROTOCOL_VERSION 2
- [ ] decision: the build fingerprint covers the pure dirs plus `src/net/{types,lockstep,inputlog,driver}.ts` (vite `define`); exchanged checkpoint hashes include the driven set and bargain policy
- [ ] decision: a Blob Worker timer backs every frame request so the host keeps sealing in a hidden tab; the stall notice tells clients to ask the host to bring the tab forward
- [ ] decision: the signalling origin is configured, absent by default: `#signal=` or `VITE_BHD_SIGNAL`; without it only `local-*` rooms work and the page says so
- [ ] backlog: verify a hidden host tab in a real browser (the Worker timer is unproven there; headless cannot show it)
- [ ] backlog: wave-master human seat (wave 11), rejoin into the same seat, adaptive input delay, host migration
- [ ] backlog: index.html entry to create or join a room (today only a typed `#room=` or `room=new`)
- [ ] backlog: the shell still calls match.setDriven / setBargainPolicy directly in solo play (see the net-contract slice)
- [ ] learning: the in-process harness cannot catch shell-level lifecycle bugs (driver built twice); a real two-page run is the only check that reaches them

## Log
- 2026-11-02 initialized
- 2026-11-02 Opus plan; B answered Q1-Q6; phase initialize → execute
