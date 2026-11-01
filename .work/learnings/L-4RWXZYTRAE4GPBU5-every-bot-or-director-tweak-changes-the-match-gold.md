---
date: 2026-11-01
read_if:
  - the golden test fails after a bot, Director or content tweak
  - parallel slices conflict on golden.ts
refs:
  - test/determinism/golden.ts
  - test/determinism/regen.ts
---

# L-4RWXZYTRAE4GPBU5 Every bot or Director tweak changes the Match golden; regenerate at integration

## Observation
The golden includes a Match section (default bots plus Director, master game), so any bot, Director or content tweak changes it.

## Why it matters
Parallel slices conflict on the golden file; only the integrating lead should regenerate it. Do not hand-merge it.
