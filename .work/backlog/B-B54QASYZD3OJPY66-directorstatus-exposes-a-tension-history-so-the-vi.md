---
created: 2026-11-01
---

# B-B54QASYZD3OJPY66 DirectorStatus exposes a tension history so the viewer need not sample it

## Why
The viewer samples tension every 0.5 s for its sparkline since DirectorStatus has no history; the Director could expose one.

## Notes
See src/director/director.ts and the viewer panels in src/client.
