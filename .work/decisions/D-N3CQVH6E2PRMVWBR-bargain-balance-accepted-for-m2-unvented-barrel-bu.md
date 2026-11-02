---
status: accepted
date: 2026-11-02
read_if:
  - tuning bargains or the bargain pool
  - reading bargain batch results
refs:
  - src/content/bargains/pool.ts#unventedBarrel
---

# D-N3CQVH6E2PRMVWBR Bargain balance accepted for M2; Unvented Barrel buffed

## Context
The w9 three-policy batch (100 pairs each, after the review fixes) showed bots judging each card ending with less Ancient hp than declining or accepting everything (0.21 vs 0.27 vs 0.37; base 0.28). Iron Discipline was always taken; Unvented Barrel and Blood Tithe never.

## Decision
B accepted the bargain balance as is for M2. The only change is an Unvented Barrel buff (bigger damage gain, heat decays slowly instead of never).

## Why
Bot preferences are a weak proxy for human play before v1.0, and pinning balance now is tech debt (D-4E4QRJ7N6LIGZDSD). Alternatives were tuning costs and the scorer in w9, or B re-specifying the pool; both deferred. The buff alone took Unvented Barrel from never taken to 0.40 and did not lower Ancient hp.

## Consequences
declineAll is not dominated but evaluate is the weakest policy; the PLAN's 15-85% accept band is not met for Iron Discipline and Blood Tithe. Tuning is backlog B-P7SA7GCWRHCTY23T.
