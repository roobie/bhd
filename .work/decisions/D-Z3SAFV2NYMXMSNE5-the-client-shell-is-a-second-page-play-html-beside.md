---
status: accepted
date: 2026-11-01
read_if:
  - changing how play.html or index.html is built or deployed
  - adding camera pan or zoom
refs:
  - src/client/shell/camera.ts
  - play.html
---

# D-Z3SAFV2NYMXMSNE5 The client shell is a second page (play.html) beside the debug viewer, with a no-pan fit-all camera that rotates 90 degrees in portrait

## Context
M2 needs a play surface while B keeps using the debug viewer on Pages.
## Decision
Ship the shell as play.html, separate from index.html; one fit-all camera, no pan or zoom.
## Why
A replacement or toggle would risk the viewer B relies on; a fit-all camera keeps the whole map visible on a phone and avoids gesture conflicts with casting.
## Consequences
Viewer and shell evolve independently; pan or zoom needs a new decision.