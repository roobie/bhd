---
status: accepted
date: 2026-11-01
read_if:
  - changing the wave preview or wave master UI
refs:
  - src/client/shell/hudmodel.ts
---

# D-OLIH7HZ4VDNQQ6FT HUD wave preview shows only what Perception gives; in wave master mode nobody sees the queue and the top bar shows a countdown

## Context
In wave master mode, the play.html default, nobody sees the queue.
## Decision
The preview shows only what Perception exposes; otherwise the top bar shows the countdown.
## Why
A guessed or placeholder preview misleads; showing nothing is honest.
## Consequences
Wave 11 wave-master UI owns any richer view.