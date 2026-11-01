---
status: accepted
date: 2026-11-02
read_if:
  - 'changing how Pavise blocks enemy attacks, or who may start a wave early'
refs:
  - src/sim/enemies.ts
  - src/sim/waves.ts
  - src/content/rules.ts
---

# D-3F64ED62IYC4SCZH A blocked enemy swing costs a full attack period; callWave is refused in master mode and throttled by callWaveMinSeconds

## Context
The first Pavise slice let a blocked enemy retry its swing every tick, which emitted a `block` event per tick. A solo player could also call waves back to back, and in master mode `callWave` competed with the wave master's `send`.

## Decision
A swing stopped by a barrier sets the enemy's attack cooldown to a full period and emits one `block` event. `callWave` does nothing in master mode, while a wave is still spawning, once every wave is spent, and within `rules.callWaveMinSeconds` of the last start.

## Why
One `block` event per blocked hit keeps the reporter's Pavise metric meaningful; the alternative, a per-tick block, made event counts depend on tick rate. Refusing `callWave` in master mode keeps `send` the single early-start path; a throttle beats a global cooldown because it needs no new state beyond `lastStart`.

## Consequences
A Pavise buys a full attack period per blocked swing. UI call-wave buttons must read `canCallWave` from perception rather than assume the command lands. `lastStart` is hashed sim state.
