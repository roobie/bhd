---
phase: finalize
parent: U-IUFI7QQSGH4543TP
owner:
  - claude
created: 2026-11-02
success_criteria:
  - An open offer shows as cards (name, who benefits, one gain and one cost line per effect), a countdown and a Decline button with its reward
  - Keys Z X C V and B, and clicks, emit one valid bargain command per offer; the card greys after sending
  - Phone (390px) shows a collapsible strip that does not cover the battlefield
  - Hero cards show pips for accepted bargains with a tooltip; help has a Bargains section and the effective def
  - npm run ci exits 0
---

# slice/w9-hud

## Purpose
The HUD side of bargains: offer cards, countdown, Decline, keys, pips and help text, all generated from effect values with no per-bargain switches.

## Scope
In: bargains.ts widgets, hudmodel/hud/controls/input/css, content presentation and help, tests.
Out: sim engine (slice A), bargain content and names, the solo bargainPolicy toggle (needs engine support).

## Context & constraints
Perception views are the contract. No gameplay pinning in tests.

## Now
Finalize: committed on the slice branch.

## Next
- Integrator wires GameSpec.bargainPolicy and a runtime setter, fills presentation.bargains labels, reconciles effectiveHeroDef target semantics with slice A.

## Evidence
- npm run ci exit 0 (log: scratchpad/w9-D-ci.log).
- Screenshots 390x844 and 1280x720 in scratchpad/w9-D/.
- Real browser: key X sent a valid accept command and disabled every card.

## Harvest
- [ ] backlog: solo "bots pick bargains" toggle needs GameSpec.bargainPolicy and a Match runtime setter
- [ ] learning: a new key binding can break the controls "other keys" test; check KEY_HELP clashes

## Log
- 2026-11-02 initialized
- 2026-11-02 execute: built panel, pips, help, keys, reducer, tests; ci green
- 2026-11-02 phase initialize → execute
- 2026-11-02 phase execute → finalize
