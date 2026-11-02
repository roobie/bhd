---
status: accepted
date: 2026-11-02
read_if:
  - changing bargain timing, picking or costs
  - multiplayer bargain ownership
refs:
  - src/content/bargains/pool.ts#defaultBargains
  - src/sim/bargains.ts
---

# D-6CSAS5UCJCBGMJEM Wave 9 bargain design: offers after 3/6/9/12, team offer with hero-bound cards, wide permanent costs, decline heals Ancient 4%

## Context
Wave 9 added bargains (gain bought with a cost on another axis; declining valid) within D-2PNKLSQWVJEBSWPI. B answered six design questions (timing, who picks, cost axes, permanence, pool, decline reward) on 2026-11-02.

## Decision
B took every recommendation: offers after waves 3/6/9/12 with 3 cards plus Decline and a 20 s window that lapses as a decline, clock not paused; team offers with hero-bound cards accepted by the benefiting hero's player (solo human picks all, opt-in bots pick; wave master gets budget); wide, permanent costs; the six-card pool; decline heals the Ancient 4%.

## Why
Overlapping waves leave no quiet time, so a timed window beats pausing. Hero-bound cards keep ownership clear for multiplayer without the engine depending on it. A small decline heal keeps declining a real option without touching the never-hurt rule. Narrower costs (own hero only) and timed bargains were the alternatives; wide permanent costs make the trade felt.

## Consequences
Seat ownership checks for who may accept land in wave 10; the engine already accepts the first valid command in (player, seq) order. Effects reaching the Ancient other than a positive heal stay forbidden by validation.
