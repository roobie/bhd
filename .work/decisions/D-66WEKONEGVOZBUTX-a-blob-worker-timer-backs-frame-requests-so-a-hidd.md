---
status: accepted
date: 2026-11-02
read_if:
  - the host stalls when its tab is in the background, or changing the shell frame loop timing
refs:
  - src/client/shell/app.ts
---

# D-66WEKONEGVOZBUTX A Blob Worker timer backs frame requests so a hidden host tab keeps sealing

## Context
The host is the sequencer (D-M7JGZLR6PZCVS7DE), so if its tab is hidden and requestAnimationFrame stops, every peer stalls. Plain timers in hidden tabs also drop to about once a second.

## Decision
A timer running in a Blob Worker backs every frame request, so the host keeps stepping and sealing while hidden. When a client stalls, the notice asks the player to have the host bring the tab forward.

## Why
Worker timers are throttled far less than page timers. Rejected: accepting the stall, and moving sequencing to a server now (a Durable Object sequencer remains a later transport swap).

## Consequences
The mechanism is not proven in a real browser: headless could not show a hidden tab, and iOS Safari may still suspend the page, which looks like a drop. It is tracked as backlog.
