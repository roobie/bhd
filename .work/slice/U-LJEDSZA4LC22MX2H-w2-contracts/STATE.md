---
phase: finalize
parent: U-Z5DSPXUKSXQ6FD7Z
owner:
  - claude (agent)
created: 2026-11-01
success_criteria:
  - npm run ci exits 0 at both commits (sim side, then bot side)
  - A probe all-bot Match, with a stub Director, runs to an `end` event in Node
  - Reaction-delay, choice-schema (emit on change), command-shape/canonical, hash-coverage (intents and master) and Match-replay tests pass
  - Purity scan covers perception, bots, intents, director and match (non-empty); layering test restricts bots and director sim imports
  - Every step-2 file exists as a stub with its real signature and a header contract; the schedule-mode golden still passes
---

# slice/w2-contracts

## Purpose
Step 1 of wave w2-bots: fix every shared shape (events, commands, intents/master hooks, hash, content, perception, bots, Match) with working stubs so six step-2 slices can fill disjoint files in parallel.

## Scope
In: the step-1 files in the wave DESIGN Slices table, plus stubs for every step-2 file.
Out: real perception features, intents board logic beyond post/fire, real Director, real kit brains, viewer.

## Context & constraints
Spec is .work/wave/U-Z5DSPXUKSXQ6FD7Z-w2-bots/DESIGN.md. Must keep the schedule-mode golden, D-4E4QRJ7N6LIGZDSD (no gameplay tests), D-NMSA2YZXKCODLCC2 (one golden file).


## Now
Both commits done (sim side `0079efa`, bot side next commit). Criteria hold; ready to report to the lead (slice not closed).

## Next
- Lead merges step 2 slices; `npm run golden` at integration.

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->
- Commit 1 (sim side): `npm run ci` exit 0; node 392 tests, browser 78; the schedule-mode golden is byte-identical (board and master hashed only once used).
- Commit 2 (bot side): `npm run ci` exit 0; node 440 tests / 27 files, browser 78. An all-bot Match with the stub Director runs to `end` (tick 4880 at seed 7). Golden diff is additions only (the `match` section).

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [ ] decision: intent `kind` clashes with the event/command discriminator `kind`; the field is `intentKind` in the `intent` command, event and board state.
- [ ] decision: intents board and master state are hashed only once used (`nextId !== 1`, `master` set), so schedule-mode hashes and the golden stay byte-identical; a hash that grows later is the cost.
- [ ] decision: `ctx.cast(hero, slot, at?)` on TickContext (built in sim.ts) is the single second cast path; it reuses `applyCommand` and reads success from the kit's `ability` event, so kits stay untouched. Chosen over a helper in commands.ts to avoid a value-import cycle (commands -> board -> commands; biome noImportCycles).
- [ ] decision: master `send` starts the wave through `startWave` called from commands.ts (not master.ts), for the same cycle reason; master.ts returns the WaveDef.
- [ ] decision: master mode keeps started waves' compositions in MasterState.started (hashed) for the `wave end` event, since the schedule no longer holds them.
- [ ] decision: `BotCtx.self` is `BotCtx.me`: the purity scan bans the global name `self`.
- [ ] decision: `decide(decision, tune{stickiness,noise}, rng, prev)` takes the doctrine's tuning, not a weights map; kit weights reach brains through `BotCtx.weights` and `weight(weights, key, fallback)`.
- [ ] decision: layering test also allows value imports of `sim/time.ts` (`ticks()`), beside type imports of `commands.ts` / `events.ts`; adjusted from the design.
- [ ] decision: `BrainTable` holds per-kit factories `(seat) => Bot` (not brains), so tests inject probes; `createBot(brain, seat)` binds memory.
- [ ] decision: the director's view is `perceiveMaster(sim)` (MasterView), separate from `Perception`, so hero bots never get it.
- [ ] decision: the golden has a `match` section (default bots + Director, master game, 3000 ticks, one golden file). Every bot or Director tweak needs `npm run golden`; parallel step-2 slices conflict on golden.ts, the lead regenerates at integration.
- [ ] learning: Match's choice emit rule: a decision absent from a think is forgotten, so its next appearance emits again.
- [ ] backlog: docs/EVENTS.md does not exist; the wave-1 design assumed one. Create it when the event schema is next refined (wave 3 reporter).

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 commit 1: sim side (events, commands, intents phase, master hook, hash, content shapes)
- 2026-11-01 commit 2: bot side (perception basics, bots, director stub, Match, tests, Match golden)
- 2026-11-01 phase execute → finalize
