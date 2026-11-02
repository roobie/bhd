---
created: 2026-11-02
---

# B-CNB5AA33IEQAPOCX Co-op follow-ups: wave-master human seat, rejoin into the same seat, adaptive input delay, host migration

## Why
Wave 10 shipped the base co-op. These were deliberately left out: a human wave-master seat (wave 11), a dropped player returning to the same hero, input delay that adapts to measured latency, and surviving a host drop.

## Notes
Rejoin needs the spec plus the input log and a headless fast-forward. Host migration needs the sequencer role to move, which a Durable Object sequencer would also solve (D-M7JGZLR6PZCVS7DE). A greyed-out wave-master seat already exists in the lobby.
