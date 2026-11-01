---
date: 2026-11-01
read_if:
  - pull intents expire unfulfilled
  - changing think cadence or reaction delay
refs:
  - src/bots/gunner.ts#gunnerBrain
  - src/bots/standins.ts#standinBrain
---

# L-KQN4NFNYHTDB6VAL A pull intent's fire lead must exceed the Gunner's think plus reaction delay

## Observation
With default cadence the Gunner needs about a think plus a reaction delay to reserve, so a pull posted with a shorter lead fires unreserved.

## Why it matters
Retune the lead whenever think cadence or reaction delay changes.
