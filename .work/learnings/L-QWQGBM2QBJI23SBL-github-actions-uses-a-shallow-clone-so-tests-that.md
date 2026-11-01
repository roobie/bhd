---
date: 2026-11-01
read_if:
  - writing tests that read git history
  - CI fails but local ci passes
refs:
  - test/reporter/sides.test.ts
---

# L-QWQGBM2QBJI23SBL GitHub Actions uses a shallow clone, so tests that walk git history (such as the root commit) pass locally but fail in CI; remote CI was red for 8 pushes before anyone noticed

## Observation
Actions checks out with depth 1, so commands like git rev-list for the root commit return a different answer than locally.

## Why it matters
CI was red unnoticed for 8 pushes; tests must not depend on full history or must skip when the clone is shallow.
