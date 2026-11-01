---
created: 2026-11-01
---

# B-5I4XKEE3TYN4IRCU lit-analyzer check for lit-html templates

## Why
lit-html templates are untyped strings to tsc; deadvox catches unknown attributes, properties and events with lit-analyzer.

## Notes
lit-analyzer needs the TS 5 Compiler API, so isolate it in its own package as deadvox does (`tools/lit-check`). Worth adding when the client HUD lands (wave 7).
