---
created: 2026-11-01
---

# B-3JFCMUA4Y7W5RKNS Perception fills lineAllies for the would-be target while the Gunner holds fire

## Why
lineAllies is empty while the Gunner holds fire (no target), so the brain estimates the line from hero positions to stop fire/hold flapping. Perception could fill it for the would-be target.

## Notes
See src/perception/perceive.ts#lineAlliesOf and the estimate in src/bots/gunner.ts.
