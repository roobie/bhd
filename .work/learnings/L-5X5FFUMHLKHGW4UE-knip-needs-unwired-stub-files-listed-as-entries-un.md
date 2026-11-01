---
date: 2026-11-01
read_if:
  - adding files before they are imported
refs:
  - knip.jsonc
---

# L-5X5FFUMHLKHGW4UE knip needs unwired stub files listed as entries until the page's module graph reaches them; remove the entries when integrating

## Observation
Knip reports unimported files, so contracts-first slices need temporary entries.

## Why it matters
Remove them at integration, or dead-code checks are silently weakened.
