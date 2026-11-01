---
phase: finalize
parent: U-PGMECOYBMCUQRATL
owner:
  - claude
created: 2026-11-01
success_criteria:
  - Ability buttons and hero-card status pips render SVG icons from content data, falling back to glyph text for unknown ids
  - H (desktop) or the top-bar ? opens a scrollable help overlay with ability cards and a status legend; Esc or H closes it; the sim is not paused
  - Help numbers come from content defs and perception through templates; invariant tests cover coverage, unfilled placeholders, NaN and fallbacks
  - npm run ci exits 0 and golden.ts is unchanged
---

# slice/w7b-help-icons

## Purpose
B asked for skill icons with info cards on demand and status indicators with help (w7b quality pass).

## Scope
In: icons, help content, help overlay, H and ? toggles, status pip restyle.
Out: sim, Effect types, snapshot.ts, scene.ts, Penitent and Psyker kits, pausing.

## Context & constraints
Hold fire moved from H to F because H is help. Numbers in help come from the GameConfig hero and status defs and from perception (cooldown).


## Now
Implemented, CI green, screenshots taken. Awaiting merge by the main agent.

## Next
- Main agent merges and reviews.

## Evidence
- npm run ci exit 0 (57 node files 791 tests, 24 browser files 123 tests). Screenshots in scratchpad w7b-help.
<!-- Proof against success_criteria: test runs, commits, measurements. -->

## Harvest
- [ ] learning: help text is hand-written per effect and status in src/content/help.ts; a new hero kit needs a help entry (tests only require shipped content) or its cards show no description
- [ ] backlog: 390px portrait ability bar overflows horizontally (4 buttons plus Stop, Hold, Arm), predates this slice
- [ ] decision: hold fire is now F, H is help (a keymap change B did not explicitly ask for)
- [ ] backlog: no shipped ability applies Exposed, so its legend entry describes a status nothing yet inflicts
<!-- Candidates found along the way. Finalize promotes or drops every unchecked item:
     - [ ] decision: …   → record decision
     - [ ] learning: …   → record learning
     - [ ] backlog: …    → record backlog
     - [ ] process: …    → retrospective (change the process, or drop it)
-->

## Log
- 2026-11-01 initialized
- 2026-11-01 phase initialize → execute
- 2026-11-01 phase execute → finalize
