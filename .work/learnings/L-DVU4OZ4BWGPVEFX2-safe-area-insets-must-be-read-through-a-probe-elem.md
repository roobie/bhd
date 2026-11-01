---
date: 2026-11-01
read_if:
  - working on phone layout or notches
refs:
  - src/client/shell/app.ts
---

# L-DVU4OZ4BWGPVEFX2 Safe-area insets must be read through a probe element's computed padding, because custom properties holding env() are not resolved

## Observation
Custom properties holding env() are not resolved when read.

## Why it matters
Read insets via a probe element's computed padding, or notched phones get zero insets.
