---
status: accepted
date: 2026-11-02
read_if:
  - changing who orders inputs, adding peers, or moving the host role to a Durable Object
refs:
  - .work/wave/U-GLFZ7OIE2B53ZZCA-w10-multiplayer/PLAN.md
---

# D-M7JGZLR6PZCVS7DE Lockstep topology: a star with the host as sequencer

## Context
Wave 10 needs 2-4 humans on one deterministic match over WebRTC. The sim is a pure function of seed, config and the ordered command stream, so the only question is who fixes that order.

## Decision
A star: every peer sends inputs to the host, the host seals each tick as an ordered list and broadcasts it, and a peer steps a tick only once it holds that tick's seal. The host's view is canonical. A Durable Object sequencer later is a transport swap.

## Why
A symmetric mesh has lower latency, but peers must agree on a dropped peer's last tick, which needs a consensus round. With a sequencer a drop is one host-issued control command and no agreement is needed. Rejected: mesh, and host-run bots (bots are deterministic, so every peer runs the same ones).

## Consequences
Clients feel the input delay plus one-way latency to the host. A host drop ends the game in M2. A hidden host tab stalls everyone, so host timing must not depend on requestAnimationFrame. Peer-to-player ownership is enforced by the host, not the sim.
