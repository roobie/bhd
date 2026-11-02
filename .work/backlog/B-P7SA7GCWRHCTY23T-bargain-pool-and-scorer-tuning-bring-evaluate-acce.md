---
created: 2026-11-02
---

# B-P7SA7GCWRHCTY23T Bargain pool and scorer tuning: bring evaluate accept rates into 15-85% band

## Why
Under the evaluate bot policy Iron Discipline is always taken and Blood Tithe never; evaluate ends with less Ancient hp than declineAll or acceptAll. PLAN wanted every card in a 15-85% accept band. B deferred this past M2 (D-N3CQVH6E2PRMVWBR).

## Notes
Scorer models magnitude as |value-1|, which overrates multiplier-to-zero patches. acceptAll best overall suggests costs are light. Per-bargain accept rates are now the bargain.accept[*] reporter series.
