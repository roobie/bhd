---
status: accepted
date: 2026-11-01
read_if:
  - adding networking or lockstep transport
  - changing how a human seat issues commands
refs:
  - src/client/shell/driver.ts
  - src/client/shell/config.ts
---

# D-VJREQF3N6HSKMGXF Human input goes through a CommandSink with a fixed input delay; GameSpec.humans leaves seats to the player and player equals slot

## Context
Human commands must reach the sim like any player's, with lockstep-like latency, so wave 10 can swap the transport.
## Decision
Humans submit through a CommandSink with a fixed input delay; GameSpec.humans leaves seats out of the bots; player equals slot.
## Why
Direct sim calls would hide latency bugs until networking; a sink is the seam multiplayer replaces.
## Consequences
Local play behaves like the networked case; the sink is a factory so restarts rebind it.