---
status: accepted
date: 2026-11-01
read_if:
  - implementing or changing the Gunner kit
  - revisiting Gunner ability slots
refs:
  - src/content/heroes/gunner.ts
---

# D-6XEPR4POWBUM74EM Gunner third ability: Suppressing Fire (provisional)

## Context
The Gunner (project DESIGN §4.1) had two designed standard abilities (Brace, Vent) plus an ultimate; the third slot was open (§10 Q2). Wave 1 needs a full kit for the reporter.

## Decision
B chose Suppressing Fire for slot 2: a wide, low-damage cone that applies Suppressed (slow). Provisional; B will revisit.

## Why
It was the lead's proposal: it gives the Gunner a setup role in the status loop (she otherwise only cashes in), and its cost axis is damage and heat time spent on a non-killing cone. Alternatives were not designed; leaving the slot empty would skew reporter metrics for ability use.

## Consequences
Numbers are free to tune. Replacing the ability later invalidates replays and shifts reporter baselines; record a superseding decision when B revisits.
