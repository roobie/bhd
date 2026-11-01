---
phase: finalize
parent: U-YPQ7HZW3Z57G4NEZ
owner:
  - claude
created: 2026-11-01
success_criteria:
  - Fixed 30 Hz integer tick loop; entity store with monotonic IDs iterated in ID order
  - '`command()` is the only path that mutates state; emits a `cmd` event'
  - Event emitter with `{tick, kind, ...}` events; state hash emitted as a `hash` event every N ticks
  - No DOM, wall clock or Math.random in src/sim
---

# slice/sim-core

## Purpose
Slice 0c: the pure deterministic simulation core (DESIGN.md §6, §6.1, §6.6).

## Scope
In: src/sim core (tick, entities, command, events, hash).
Out: map, combat, heroes, enemies (wave 1).

## Context & constraints
Starts after scaffold; may run alongside detmath, coding against its interface. Owns src/sim exclusively.

## Now
Done (subagent); reviewed and integrated.

## Next
- Close.

## Evidence
- `src/sim/`: `Sim` (TICK_HZ 30, command(player, cmd, tick?), step() → events, hash() 64-bit hex), EntityStore (Map, monotonic IDs), StateHasher, placeholder spawn/move + moveSystem.
- `npx vitest run test/sim`: 17/17 (ID order, command scheduling/order, past/invalid rejection, same seed+script → identical events and hashes, different seed/command → different hashes, hash every N, two sims isolated).
- Full `npm run ci` green (54 tests).

## Harvest
- [x] decision: (player, seq) command order; past ticks rejected → D-ZWZVLE5U4MRETLI7
- [x] decision: hash excludes pending commands → D-NZFIASEDRLJLBWAF
- [x] learning: hash new entity fields; append-only type codes → L-53OTZPIIVO2XYNNL
- [x] learning: Biome idioms → L-ZN7SSMFEBPMSB5WP
- [x] learning: replay = feed logged `cmd` events back through command(player, cmd, tick) → closing commit message
- [x] backlog: replace placeholders in wave 1 → B-GLHTOKUXFDT5U2ZC

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 implemented by subagent; harvested; phase → finalize
