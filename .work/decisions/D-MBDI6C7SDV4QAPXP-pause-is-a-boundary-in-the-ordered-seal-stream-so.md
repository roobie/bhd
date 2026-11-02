---
status: accepted
date: 2026-11-02
read_if:
  - changing pause, resume or the host sealing loop
refs:
  - src/net/lockstep.ts
  - src/client/shell/frame.ts
---

# D-MBDI6C7SDV4QAPXP Pause is a boundary in the ordered seal stream so every peer halts at the same tick

## Context
Anyone may pause in co-op. A first version let clients halt wherever their own clock was, and host and clients stopped at different ticks, which only the real two-tab run showed.

## Decision
The host broadcasts the pause right after its last seal. Links are ordered, so each peer halts at the highest tick it holds, which is the host's pause tick. Resume continues from that boundary, and pause toggles are rate limited. The host keeps the pause, input and seal ordering in one place rather than trusting each peer's clock.

## Why
Stepping simply halting costs nothing on the wire and needs no agreement round. Rejected: a pause tick negotiated per peer, and local-only pausing.

## Consequences
Test peers must be driven by the shell's own frame planning or the boundary bug is invisible (L-Q7FIWJCK73V2LWA3). Input sent during a pause is held, not lost.
