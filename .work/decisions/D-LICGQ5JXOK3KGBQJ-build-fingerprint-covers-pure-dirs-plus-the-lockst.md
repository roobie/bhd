---
status: accepted
date: 2026-11-02
read_if:
  - adding files to the sim or lockstep path, or a handshake rejects builds that look identical
refs:
  - vite.config.ts
  - src/net/types.ts
---

# D-LICGQ5JXOK3KGBQJ Build fingerprint covers pure dirs plus the lockstep net files; checkpoint hashes include driven set and policy

## Context
The deployer ships pages and the Worker separately, so two peers can run different builds. A mismatch in the sim is a silent desync. The first design fingerprinted only the pure directories, and the sim hash left out Match-level state that changes bot behaviour.

## Decision
The build fingerprint, injected at build time and sent in hello, covers the pure directories plus the lockstep net files that decide input order and sealing. The hash peers exchange at checkpoints also covers the driven set and the bargain policy.

## Why
The review showed that a change to sealing or ordering code desyncs peers exactly like a sim change, so it must be part of build identity. Driven slots and policy decide what bots do, so a peer that disagrees on them diverges before the sim hash shows it. Rejected: fingerprinting the whole source tree, which would refuse peers on UI-only changes.

## Consequences
New files on the sim or lockstep path must be added to the fingerprint list. A UI-only deploy does not break running rooms. A refused fingerprint shows the mismatch screen in the lobby.
