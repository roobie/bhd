---
phase: finalize
parent: U-UKXAXH6M7EWBHXWC
owner:
  - claude
created: 2026-11-01
success_criteria:
  - Every file in the wave DESIGN ownership table exists with the fixed signatures and a minimal working stub
  - Placeholder dummy entity and spawn/move commands are replaced by the wave-1 command set (debug spawn kept, marked)
  - 'Sim takes {seed, game: GameConfig}; defaultGame() constructs and steps'
  - Determinism scenario uses the new commands; golden regenerated; npm run ci green
---

# slice/sim-contracts

## Purpose
Fix the shared types and files of wave 1 so the other four slices can run in parallel without touching the same files.

## Scope
In: entity model, commands, events, hash, queries, time helpers, kit dispatch, GameConfig, stubs
Out: real combat, waves, kits (other slices)

## Context & constraints
See wave DESIGN.md (.work/wave/U-UKXAXH6M7EWBHXWC-w1-content-combat/DESIGN.md) for the shared contract and file ownership.

### Origin
Promoted from backlog: B-GLHTOKUXFDT5U2ZC Replace placeholder spawn/move commands and dummy entity in wave 1

### Why
sim-core shipped placeholder `spawn`/`move` commands, a `dummy` entity type and a straight-line move system only so determinism could be tested.

### Notes
Wave 1 (lane map, combat, Gunner, stand-ins) replaces them; keep the determinism tests working while doing so.


## Now
Done; closing.

## Next
- Opus review, merge, then lane-waves ∥ combat-core

## Evidence
<!-- Proof against success_criteria: test runs, commits, measurements. -->
- Every ownership-table file exists with a working stub: `src/sim/{sim,entities,commands,events,context,hash,query,time,movement,deaths,waves,enemies,combat,statuses}.ts`, `src/sim/heroes/{index,gunner,standins}.ts`, `src/content/{index,types,map,enemies,waves,statuses}.ts`, `src/content/heroes/{gunner,standins}.ts`. Proven by `tsc`, knip and the headless run in `test/content/default-game.test.ts`.
- Placeholders gone: no `dummy` type, old spawn/move commands replaced by move/stop/hold/ability/autocast plus debug `spawn {def,x,y}`; `test/sim/commands.test.ts` (validation, `-0` canonicalisation, JSON round trip), `test/sim/sim.test.ts`.
- `new Sim({seed, game, hashEvery?})`; `defaultGame()` constructs and steps: `test/sim/sim.test.ts` (setup, ids, units), `test/content/default-game.test.ts` (4-hero lineup; runs with no commands to `end` {victory} at tick 4951, seed 1; bound 12000 ticks), `test/sim/leak.test.ts` (leak damages Ancient, `end` ancient-destroyed, gameplay stops).
- Determinism scenario rewritten against `defaultGame()` (all command kinds, `-0`, same-tick seq pair; 1500 ticks; 32 spawns, 126 dmg, 14 deaths); golden regenerated with `npm run golden` (invalidates stored replays: wave-0 only); interleaved + JSON replay tests kept.
- Gate: `npm run ci` green (biome ci, tsc, knip, node 257 tests / 17 files, browser 75 tests x 3 engines).
- Opus review fixes (all with tests): dead units skipped by queries/heroSystem/enemies stub and stub kits keep no cooldown on 0 damage (`test/sim/query.test.ts`, `mechanics.test.ts`, `leak.test.ts`); `taunted` aggro, `heal`, `removeStatus`, `rooted` (0 speed, blocks move), shared `KitBase` hold/autocast (`mechanics.test.ts`); `unitsOnSegment` ordered by t with `t` returned; cooldown/`until`/wave times hashed as f64; reflective hash coverage test (`test/sim/hash.test.ts`); `validateGame` (finite numbers, unique unit ids, unique status ids); `command()` after end -> `ended`; leak damage = `leakDamage` exactly. Golden regenerated again.

## Harvest
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [x] decision: …   → record decision
     - [x] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->
- [x] decision: Content ids (def, status) are hashed as text (`StateHasher.str`, UTF-16 units) and statuses sort by id text then src, not by numeric status code; only entity kind and move mode use append-only code tables.
- [x] decision: After `end` the Sim only advances the clock and emits `hash` events; `command()` returns `{ok:false, reason:'ended'}`. `end.reason` is `ancient-destroyed` or `victory` (all waves spawned, no enemy alive).
- [x] decision: Wave scheduler state lives in `ctx.waves` and is hashed by `hashWaves` in waves.ts (not an entity field); kit state is hashed via each kit's `hash`. Anything else stateful must get the same treatment.
- [x] decision: Killer attribution without an extra entity field: `ctx.killers` (victim -> src, transient, cleared each tick) is set by `dealDamage` when a hit takes hp to 0 and read by deaths. combat-core must keep setting it.
- [x] decision: Queries count bodies (centre distance <= reach + unit radius) and compare squared distances; `unitsInRadius` takes an optional team filter.
- [x] decision: Setup (Ancient id 1, then lineup ids 2..) runs as tick 0 inside the constructor; its `spawn` events are returned by the first `step()`.
- [x] learning: Biome `useMaxParams` (4) forces options objects or `Point` args; the fixed signatures in the wave DESIGN needed it for applyStatus, unitsInRadius, unitsOnSegment, spawnEnemy and the kit functions. Type-only import cycles (entities <-> kit files, context <-> waves) pass `noImportCycles`.
- [x] decision: Systems skip actors with hp <= 0 (corpses live until deaths runs); queries never return them.
- [x] decision: Taunt: enemies target the src of the live `taunted` instance with the greatest `until` (ties: lowest src), else nearest hostile. Stand-ins only apply the status; they never edit enemies.ts.
- [x] decision: `rooted` status is the Brace mechanism: effectiveSpeed 0 and move commands ignored. `clumped` is applied by the stand-in pull.
- [x] decision: Kit `hold` and `autocast` (bit i = slot i) live in shared `KitBase`, set by commandHero and hashed by the dispatcher together with kit kind; kits hash only their own extra fields.
- [x] decision: Tick counts that may turn fractional (cooldown, `until`, wave times) hash as f64; applyStatus durations must be whole ticks.
- [x] decision: Leak damage uses tag 'leak', which bypasses armour and modifiers: livesLost = def.leakDamage. combat-core must keep this.
- [x] decision: `unitsOnSegment` returns all teams including the shooter, ordered by projection t then ID; callers filter.
- [x] learning: A reflective hash test (`test/sim/hash.test.ts`) walks every leaf of an entity, kit and wave state, so new fields left out of the hash fail it.
- [x] (→ combat-core STATE) backlog: Stub `effectiveSpeed` ignores Suppressed; combat-core owns the slow, movement.ts already calls it.
- [x] (→ lane-waves STATE) backlog: `wave` events emit only `phase: start`; `phase: end` is defined but unused (lane-waves to decide when a wave ends).
- [x] (→ backlog record) backlog: Hero death removes the hero entity (deaths system removes anything at 0 hp); revisit with scars/respawn in wave 9.

Decisions folded into one contract decision record; learnings folded into L-ZN7SSMFEBPMSB5WP and L-53OTZPIIVO2XYNNL.

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
