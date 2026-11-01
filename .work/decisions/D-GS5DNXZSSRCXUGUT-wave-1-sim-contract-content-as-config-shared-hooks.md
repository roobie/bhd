---
status: accepted
date: 2026-11-01
read_if:
  - adding a system, status, hero kit or stateful sim field
  - a later slice seems to need to edit another slice's file
refs:
  - src/sim/sim.ts#Sim
  - src/sim/heroes/index.ts
  - src/sim/query.ts#unitsOnSegment
  - src/sim/enemies.ts
  - src/content/index.ts#defaultGame
---

# D-GS5DNXZSSRCXUGUT Wave-1 sim contract: content as config, shared hooks, corpses skipped

## Context
Wave 1 runs four slices in parallel (lanes/enemies, combat, Gunner, stand-ins) on one sim. Without a fixed contract they would all edit the same files, and each would invent its own way to hash state, find targets and end the game. The reporter (wave 5) must compare two content configs without code changes.

## Decision
The sim takes all content as a `GameConfig` and validates it. Cross-slice behaviour goes through hooks fixed up front: statuses (`taunted` drives enemy aggro, `rooted` is Brace, `clumped` comes from the stand-in pull), `dealDamage`/`heal`/`removeStatus`, a shared kit base (hold, autocast) hashed by the dispatcher, and segment queries ordered along the ray. Corpses (hp ≤ 0) stay until the deaths system runs, and no system or query acts on them. Leak damage bypasses modifiers. After `end`, only the clock advances and commands are refused.

## Why
Fixed hooks keep each slice inside its own files, so merges do not conflict and reviews stay local. The alternative, slices editing each other's files with coordination by convention, was rejected because of merge risk. Skipping corpses avoids wasted attacks and leaks by dead enemies, which are ordering bugs that would make results depend on ID order. Content ids are hashed as text rather than through code tables, because a content rename already invalidates replays, so a second table to keep append-only would add nothing.

## Consequences
New cross-slice behaviour needs a new hook, and the wave lead adds it to the contract first. Any new stateful field must be hashed; the reflective hash test enforces this. Setup (Ancient, lineup) runs as tick 0 inside the constructor.
