---
phase: execute
parent: U-RTZB3ZJZRHUYJYR5
owner:
  - claude
created: 2026-11-01
success_criteria:
  - '`play.html` (also on Pages) draws the live match with the WebGL2 instanced SDF renderer, interpolated between ticks, with the whole map visible at 390×844 portrait and 1280×720 landscape; screenshots of both in Evidence'
  - With `#drive=<slot>` a human moves, casts every ability of that hero, toggles autocast, stop and hold, by mouse+keys and by touch (Playwright touch emulation); these actions reach the sim only as `cmd` events from player = slot
  - The HUD shows hero cards (hp, resource bars with marks, statuses), cooldowns, wave preview and Ancient hp from Perception plus `src/content/presentation.ts`; a hero, effect or status without a presentation entry still renders through fallbacks (tested); no `shell/` code switches on a hero, kit or effect name
  - A human arms a trigger (`intent post`), and reserves and cancels on intents; in the step-3 demo a bot Gunner reserves against a human-armed pull, and the log shows reserve, fire and fulfil
  - A driven local game's `cmd` events replay into a fresh sim with identical hashes (node test); the golden is unchanged by the wave
  - The debug viewer at `index.html` works as before and its browser tests pass; `npm run ci` is green, with gl and shell browser tests in chromium, firefox and webkit (or the WebGL2-unavailable fallback asserted and recorded)
---

# wave/w7-client-shell

## Purpose
Build the client shell that M2 plays in: a WebGL2 SDF renderer, input mapped to sim commands for desktop and touch, a kit-agnostic HUD and arming-trigger UI (project DESIGN §7 wave 7, items 7a–7d). Waves 8, 10 and 11 plug into it.

## Scope
In: renderer with interpolation and portrait/landscape camera fit; input→commands (select, move, stop, hold, abilities, autocast); HUD (hero cards, resources, cooldowns, statuses, wave preview, Ancient); arming triggers (intent post, reserve, cancel); a minimal way to drive chosen hero slots by hand in a local match (`play.html#drive=…`, `GameSpec.humans`, a local `CommandSink` with lockstep-like input delay); presentation content; additive perception fields (cooldownTicks, marks, autocast); pure frame driver (B-C4FU2FN3T5OXCUTV).
Out: the solo loop and switching the driven hero mid-game (8a); Penitent and Psyker kits (6, 8b); combo callouts, hitstop and sound (8c); bargains (9); networking and the lockstep transport (10); wave master UI (11); camera pan and zoom; replaying driven games from logs; art assets.

## Context & constraints
See DESIGN.md. The sim stays pure and deterministic, and the client only reads state and submits commands. Kit-agnostic: ability buttons, resource bars and statuses come from Perception plus content data. No new dependencies (lit-html is present). Biome with all rules as errors, TS strict, max 4 params. No gameplay-pinning tests (D-4E4QRJ7N6LIGZDSD). The debug viewer stays working for B on Pages. Sonnet subagents implement, Opus reviews (CLAUDE.md).

## Now
Design written; awaiting lead review before execute.

## Next
- Lead reviews DESIGN.md, sends the two open questions to B (non-blocking), and moves to execute.
- Step 1: w7-contracts slice.
- Step 2: parallel slices w7-gl, w7-viewmath, w7-scene, w7-input, w7-hud, w7-arming, w7-shell.
- Step 3: lead integration, demo and screenshots, Opus review.

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] decision: the shell is a second page (play.html) beside the debug viewer, not a replacement or a toggle
- [ ] decision: human input goes through a CommandSink with INPUT_DELAY_TICKS = 3; GameSpec.humans leaves seats out; player = slot
- [ ] decision: the HUD is kit-agnostic over Perception + content/presentation.ts with fallbacks; perception gains cooldownTicks, marks, autocast
- [ ] decision: the camera fits the whole map and rotates 90° in portrait; no pan or zoom in wave 7
- [ ] backlog: replay driven games by feeding logged human cmd events back into the viewer/replay
- [ ] backlog: B-C4FU2FN3T5OXCUTV is consumed by w7-viewmath (close it at finalize)

## Log
- 2026-11-01 initialized
- 2026-11-01 design drafted by an Opus planner (purpose, scope, criteria, slices)
- 2026-11-01 phase initialize → execute
