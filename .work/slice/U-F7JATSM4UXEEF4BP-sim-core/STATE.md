---
phase: initialize
parent: U-YPQ7HZW3Z57G4NEZ
owner:
  - claude
created: 2026-11-01
success_criteria:
  - 'Fixed 30 Hz integer tick loop; entity store with monotonic IDs iterated in ID order'
  - '`command()` is the only path that mutates state; emits a `cmd` event'
  - 'Event emitter with `{tick, kind, ...}` events; state hash emitted as a `hash` event every N ticks'
  - 'No DOM, wall clock or Math.random in src/sim'
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
Waiting on scaffold.

## Next
- Decide hash function and canonical state serialization.

## Evidence
## Harvest
## Log
- 2026-11-01 initialized
