---
phase: execute
parent: U-GLFZ7OIE2B53ZZCA
owner:
  - claude
created: 2026-11-02
success_criteria:
  - 2, 3 and 4 peers over the seeded loopback hub (latency, jitter, cross-peer reorder) produce identical hash sequences, equal to replayInputs(spec, hostSeals)
  - Pause, resume, a drive handover, a policy toggle and a drop behave the same on every peer; a host drop ends the game for clients
  - A stray sim.command on one peer is detected at the next checkpoint, halts everyone, and the dumps plus `bhd desync` localise it
  - npm run ci green
---

# slice/w10-lockstep-core

## Purpose
The lockstep core of wave 10: host sequencer, client driver, input log, desync tooling.

## Scope
In: src/net/{lockstep,inputlog,driver,desync}.ts, src/reporter/desynccmd.ts (+ registration in cli.ts, usage line in args.ts), test/net/{hub,harness,lockstep.test,desync.test}, test/reporter/desynccmd.test.ts, `isPeerCommand` in net/types.ts.
Out: lobby, shell wiring, rtc, signalling, Match changes.

## Context & constraints
Rule R1; no gameplay pinning. Host seals tick T in beforeStep(T); pause is a boundary in the ordered stream.

## Now
Done; awaiting merge.

## Next
- Lead: integration (shell wiring, cross-runtime scenario segment, bargain-accept positive path with a real offer).

## Evidence
npm run ci exit 0 (1108 node tests, 135 browser tests).

## Harvest
- [ ] learning: pause needs no wire change: the host broadcasts `pause` right after its last seal and the link is ordered, so each client halts at the highest tick it holds.
- [ ] learning: a dump alone cannot show a stray sim.command in a seal-replay; the log therefore records the peer's `cmd` events and `bhd desync` diffs them against the replay of its seals.

## Log
- 2026-11-02 initialized
- 2026-11-02 built, tested, CI green
