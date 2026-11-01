---
status: accepted
date: 2026-11-01
read_if:
  - starting the renderer, replay viewer or client shell
refs:
---

# D-KSV7KSI3V23XZGVT Drop the last-ancient prototype as a reference

## Context
The handoff pointed at `prototype/last-ancient.html` for the renderer, layout and touch input. B says it was an early experiment and reflects little of the refined design.

## Decision
Do not use or port the prototype. Build the renderer, replay viewer and client fresh from DESIGN.md. Decided by B.

## Why
Porting code from an outdated design would bring in its assumptions (5 classic-fantasy heroes, a non-deterministic sim) and save little effort.

## Consequences
Waves 5f and 7a build the WebGL2 instanced SDF renderer from scratch.
