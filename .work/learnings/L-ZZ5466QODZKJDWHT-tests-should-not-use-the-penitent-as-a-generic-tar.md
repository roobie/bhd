---
date: 2026-11-01
read_if:
  - writing heal, friendly-fire or reporter tests that pick a hero by slot
refs:
  - src/content/index.ts
---

# L-ZZ5466QODZKJDWHT Tests should not use the Penitent as a generic target

When slot 1 became the Penitent (heals on him are x0.25, friendly fire floors him at 1 hp), heal, friendly-fire and reporter tests that named a hero by slot broke. Pick a hero without special rules as the generic target.
