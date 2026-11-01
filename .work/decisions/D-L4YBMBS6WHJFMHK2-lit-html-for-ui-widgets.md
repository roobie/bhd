---
status: accepted
date: 2026-11-01
read_if:
  - building HUD, menus or any DOM UI
refs:
  - src/client/main.ts
---

# D-L4YBMBS6WHJFMHK2 lit-html for UI widgets

## Context
The client needs HUD, menus and widgets over a WebGL canvas, and the handoff did not choose a UI approach.

## Decision
DOM UI uses lit-html templates. Decided by B.

## Why
It is small, has no component framework or virtual DOM, and B already uses it in deadvox. React and full Lit were heavier than a HUD over a canvas needs.

## Consequences
UI code stays out of the pure folders (sim, perception, bots, intents, director). lit-analyzer can be added later, isolated, as deadvox does.
