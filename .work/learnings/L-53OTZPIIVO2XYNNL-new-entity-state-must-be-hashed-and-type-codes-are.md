---
date: 2026-11-01
read_if:
  - adding entity fields or entity types
refs:
  - test/sim/hash.test.ts
  - src/sim/sim.ts#hash
  - src/sim/entities.ts#ENTITY_KIND_CODE
---

# L-53OTZPIIVO2XYNNL New entity state must be hashed and type codes are append-only

## Observation
The state hash enumerates entity fields explicitly, and entity types are hashed through a numeric code table.

## Why it matters
A new field left out of the hash hides desyncs in it. Reordering or reusing type codes silently changes hashes of old replays, so codes are only appended. Entity IDs must never be re-inserted into the store, or Map iteration stops being ID order. The reflective hash test perturbs every leaf of entity, kit and wave state, so an unhashed new field fails CI.
