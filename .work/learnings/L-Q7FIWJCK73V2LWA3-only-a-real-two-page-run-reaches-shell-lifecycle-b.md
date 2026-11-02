---
date: 2026-11-02
read_if:
  - writing or trusting a multiplayer harness, or touching the shell driver lifecycle and HUD remount
refs:
  - test/net/two-tabs.e2e.ts
  - test/net/harness.ts
---

# L-Q7FIWJCK73V2LWA3 Only a real two-page run reaches shell lifecycle bugs, and the harness must use the shell step functions

## Observation
The in-process harness passed every test while real tabs showed three bugs: the shell built its driver twice and disposing the first ended the game on every peer at tick 0, a second game needed a fresh HUD root because lit keeps render state on the root element, and host and clients halted a pause at different ticks. The last one only surfaced once the harness drove peers through the shell's own pure frame-planning and step-budget functions instead of its own target maths. See refs.

## Why it matters
A harness that models time or lifecycle itself proves the model, not the shell. Keep the two-tab script as the check for shell-level changes, and keep the harness on the shell's functions. It stops being true only if the shell lifecycle is moved out of the shell.
