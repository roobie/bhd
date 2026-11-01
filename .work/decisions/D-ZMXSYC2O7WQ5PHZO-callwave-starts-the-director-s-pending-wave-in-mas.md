---
status: accepted
date: 2026-11-02
read_if:
  - 'changing who may start a wave early, or what the call-wave button shows'
  - 'changing how Pavise blocks enemy attacks'
refs:
  - src/sim/waves.ts#canCallWave
  - src/sim/master.ts#canSend
  - src/perception/perceive.ts
  - src/sim/enemies.ts
  - src/content/rules.ts
supersedes:
  - D-3F64ED62IYC4SCZH
---

# D-ZMXSYC2O7WQ5PHZO callWave starts the Director's pending wave in master mode, under both throttles; one shared canCallWave predicate drives sim and HUD

## Context
D-3F64ED62IYC4SCZH made `callWave` a no-op in master mode. The shell defaults to director mode, so the HUD's Call next wave button (and the N key) did nothing in the default game, against D-H2FHQUWM3IJDUPCU (call early works in every mode). The same decision also fixed Pavise: a blocked enemy swing costs a full attack period and emits one `block` event.

## Decision
A swing stopped by a barrier sets the enemy's attack cooldown to a full period and emits one `block` event (unchanged). `callWave` starts the next wave now, in every mode, when `canCallWave` holds: waves remain, the current wave has finished spawning, `rules.callWaveMinSeconds` have passed since the last start, and in master mode `canSend` (something pending, `minIntervalSeconds` passed). In master mode it starts the Director's pending wave through the same path as `send`; otherwise it is a silent no-op. Perception exposes `wave.canCall`, computed by the same function, and the HUD button reads it.

## Why
Refusing in master mode kept `send` the single early-start path, but left a live button that dropped every press. Reusing the `send` checks keeps the Director's budget, interval and pending semantics intact, and a human call cannot start an empty wave. A throttle beats a global cooldown because it needs no new state beyond `lastStart`. One shared predicate keeps the HUD from drifting from the sim.

## Consequences
In master mode a human call and the Director's `send` are the same action, so both obey `minIntervalSeconds`; with the shipped interval longer than that, there is a window to call. A Pavise buys a full attack period per blocked swing. `lastStart` is hashed sim state. UI must read `wave.canCall` rather than assume the command lands.
