---
date: 2026-11-01
read_if:
  - fighting a Biome lint error
refs:
  - biome.jsonc
---

# L-ZN7SSMFEBPMSB5WP Biome strict-rule idioms for this codebase

## Observation
With every stable Biome rule on, some common idioms are rejected: barrel index files, increment statements, approximate math constants and over-precise literals, `satisfies never` as a statement, method-style interface members, and assertions inside test helpers.

## Why it matters
Put a module's code in its index directly instead of re-exporting; write `+= 1`; use Math.PI and shortest round-trip literals; do exhaustiveness with a `never`-typed const; use property-style members; make test helpers throw. In pure folders, `const { PI } = Math` (what useDestructuring suggests) trips the purity scan, so keep `Math.PI` behind a biome-ignore. Exact float constants in goldens are stored as strings (noApproximativeNumericConstant). Test snippets containing a dollar-brace are built with join (noTemplateCurlyInString). Vitest fails a file whose describe is empty. Set NO_COLOR=1 for readable logs. Saves a lint round trip for every new slice.
