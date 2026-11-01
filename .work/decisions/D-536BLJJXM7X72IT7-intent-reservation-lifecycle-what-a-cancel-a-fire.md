---
status: accepted
date: 2026-11-01
read_if:
  - changing the intents board or the pull intent
  - a bot reserves too late or too early
refs:
  - src/intents/board.ts#applyIntentCommand
  - src/intents/board.ts#intentSystem
---

# D-536BLJJXM7X72IT7 Intent reservation lifecycle: what a cancel, a fire and a late command mean

## Context
The board coordinates a poster (who wants something done at a time) and reservers (who commit to doing it), under command-then-intents tick ordering and reaction delays.

## Decision
A poster cancelling expires its reservations at once; a reserver may cancel until the intent resolves. Only an unfired pending intent blocks the poster's next post; fired or expired intents linger while reservations remain and still count toward the live limit. A hero cannot reserve its own intent, and a reserve or cancel applied on the fire tick is too late.

## Why
Resolving reservations deterministically at fire time keeps the outcome independent of command arrival order within the tick. Allowing re-posts after fire lets a support chain pulls without waiting for cleanup.

## Consequences
Posters must give a fire lead longer than the reserver's reaction (see L-KQN4NFNYHTDB6VAL).
