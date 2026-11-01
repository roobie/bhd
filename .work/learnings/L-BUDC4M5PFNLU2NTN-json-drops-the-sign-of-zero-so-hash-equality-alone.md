---
date: 2026-11-01
read_if:
  - serialising commands, replays or netcode messages
refs:
  - test/determinism/determinism-node.test.ts
---

# L-BUDC4M5PFNLU2NTN JSON drops the sign of zero, so hash-equality alone misses -0 desyncs

## Observation
A replay rebuilt from in-memory command objects matched hashes, while the same replay round-tripped through JSON diverged on every tick: a -0 coordinate came back as 0. See the JSON replay and no-negative-zero tests in refs.

## Why it matters
Determinism tests must go through the real serialisation path, not in-memory objects. The same applies to any future encoding (binary netcode, save files): test the round trip and compare full event streams, not only hashes.
