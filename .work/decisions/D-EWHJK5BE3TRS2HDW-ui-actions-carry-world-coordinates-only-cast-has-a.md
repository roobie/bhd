---
status: accepted
date: 2026-11-01
read_if:
  - adding an input path (touch, gamepad) or ability button
refs:
  - src/client/shell/types.ts
  - src/client/shell/arming.ts
---

# D-EWHJK5BE3TRS2HDW UI actions carry world coordinates only, cast has an arm flag, and arming returns a handled step so controls can delegate

## Context
Input paths (mouse, keys, touch, HUD buttons) all feed one reducer.
## Decision
UI actions carry world coordinates only, cast carries an arm flag, and arming returns a handled step so controls can delegate.
## Why
Screen coordinates in actions would tie reducers to the camera; the HUD receives screenToWorld for drag casts.
## Consequences
New input devices only need to emit UiActions.