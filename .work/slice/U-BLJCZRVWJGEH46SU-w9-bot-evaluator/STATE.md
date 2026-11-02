---
phase: finalize
parent: U-IUFI7QQSGH4543TP
owner:
  - claude
created: 2026-11-02
success_criteria:
  - Bots decide bargain offers from Perception only, with a generic scorer and a bargain.offer choice (decline / accept:<card>)
  - declineAll, acceptAll and the human/off match policies behave as specced
  - Invariant tests green (deterministic, not constant over situations); npm run ci exit 0
---

# slice/w9-bot-evaluator

## Purpose
The bot that accepts or declines bargain offers (wave 9 slice C).

## Scope
In: src/bots/bargain.ts, src/content/bots/bargain.ts, test/bots/bargain.test.ts, tiny Decision.hero hook in match/types, preview armour in perception.
Out: sim engine, pool, HUD, reporter.

## Context & constraints
Bots read only Perception (D-ABIU2YALDBBGMWAR). No gameplay pinning.

## Now
Done; in finalize.

## Evidence
- npm run ci exit 0 (log w9-C-ci.log); test/bots/bargain.test.ts 13 tests.

## Harvest
- [ ] learning: a Decision has one `choice.hero`, so the offer decision takes the best-scored card's hero (Decision.hero); one seat (first living hero) decides per offer.

## Log
- 2026-11-02 initialized
- 2026-11-02 built scorer, weights, tests; ci green
- 2026-11-02 phase execute → finalize
