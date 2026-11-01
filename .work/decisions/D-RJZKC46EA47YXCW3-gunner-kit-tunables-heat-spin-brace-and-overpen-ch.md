---
status: accepted
date: 2026-11-01
read_if:
  - tuning or changing Gunner heat, spin, brace, vent or overpenetration
  - a Gunner change moves reporter baselines unexpectedly
refs:
  - src/sim/heroes/gunner.ts
  - src/content/heroes/gunner.ts
---

# D-RJZKC46EA47YXCW3 Gunner kit tunables: heat, spin, brace and overpen choices

## Context
The Gunner design (project DESIGN §4.1) fixes the headline mechanics but leaves many edge behaviours open: when heat and spin decay, what unbracing costs, what is refused during lockout, and who overpenetration can hit. Each had to be chosen to make a full kit.

## Decision
Heat decays only while there is no target; braced spin never decays and unbraced idle spin drains over about 2 s; unbracing roots the Gunner and blocks fire for 1 s; abilities are refused while locked out; overpenetration skips the Ancient; braced cones aim along the brace facing; one resource event is emitted per band change; heat bleeds linearly to 0 during lockout and spin resets on overheat. All are tunable defaults, not design commitments.

## Why
Each choice was the simplest rule that keeps the heat loop legible to the reporter (one event per band, no hidden decay while firing) and keeps the Ancient's health a pure leak measure. Alternatives such as decay while firing or ability use during lockout were not designed.

## Consequences
Changing any of them shifts the golden and reporter baselines for gunner.heat. Revisit with B when the Gunner is tuned.
