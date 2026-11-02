---
date: 2026-11-02
read_if:
  - debugging a desync, changing the dump format or bhd desync
refs:
  - src/net/inputlog.ts
  - src/reporter/desynccmd.ts
---

# L-CPMOPMRZGAHPFCQE A seal replay cannot show an injected stray command, so the dump keeps the peer cmd events

## Observation
A stray sim.command on one peer never appears in the seals, so replaying that peer's seals reproduces the host and the divergence vanishes. The dump therefore records the peer's own cmd events, and the desync tool diffs them against the replay of its seals. See refs.

## Why it matters
Any desync cause outside the sealed stream (a rule R1 violation, a local mutation) is only localisable through that extra record. If the dump format is slimmed down, this class of bug becomes undiagnosable.
