---
date: 2026-11-01
read_if:
  - the purity test fails on an innocent local name
refs:
  - test/purity-scan.ts
---

# L-WGOY42J5J2SHRLWG Purity scan bans the names self, window and Math.hypot in bot and perception code

## Observation
The scan rejects the bare names self and window even as local variables, and Math.hypot in perception. The bot context field for the acting hero is named me for that reason.

## Why it matters
Pick other names instead of fighting the scan; this stops being true if the scan becomes AST based.
