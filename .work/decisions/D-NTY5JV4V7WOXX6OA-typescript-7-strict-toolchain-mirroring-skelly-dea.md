---
status: accepted
date: 2026-11-01
read_if:
  - changing build, lint, test or type-check tooling
  - adding a Node CLI or script
refs:
  - tsconfig.json
  - biome.jsonc
  - package.json
---

# D-NTY5JV4V7WOXX6OA TypeScript 7 strict toolchain mirroring skelly/deadvox

## Context
B wanted the same stack as skelly/deadvox, where it already works, so tooling knowledge and config carry across projects.

## Decision
TypeScript 7 strict with deadvox's compiler flags, Biome with every stable rule on, knip, Vite, Vitest, and Node's own type stripping for CLIs. Decided by B.

## Why
Strict types and maximal static analysis catch determinism and lockstep bugs early, and those are expensive to find later. Node type stripping replaces `tsx` (the handoff default) because it needs no extra dependency and deadvox already relies on it. ESLint was the other lint option; Biome won for speed and because skelly's config already exists.

## Consequences
Only erasable TS syntax is allowed (no enums, namespaces or parameter properties). Biome must not touch markdown: its formatter breaks dev-proc front matter. Biome cannot express "ban this call only in these folders" cleanly, so the determinism banned-API check needs its own mechanism.
