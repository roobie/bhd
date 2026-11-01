---
status: accepted
date: 2026-11-01
read_if:
  - tuning abilities or statuses
  - editing help or legend text
refs:
  - src/content/help.ts
---

# D-XQMB2FS3UBAE7OZM Help text is generated from content values; status legend numbers come from the single applying ability

## Context
Help cards and the status legend must stay true after balance tuning.

## Decision
Help text is generated from content values; status legend numbers come from the single applying ability, and a status with no unique applier shows no numbers.

## Why
Hand-typed numbers drift after tuning. Reading status defs was rejected because the sim uses ability values, not status defs.

## Consequences
Help cannot lie after tuning. A new hero kit still needs a hand-written help entry and icons.
