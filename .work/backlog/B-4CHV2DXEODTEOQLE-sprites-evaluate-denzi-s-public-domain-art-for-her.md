---
created: 2026-11-01
---

# B-4CHV2DXEODTEOQLE Sprites: evaluate Denzi's public-domain art for heroes/enemies

## Why
B: "I think using some sprites would lift the game". The SDF shapes read as placeholders.

## Notes
- Source: https://opengameart.org/content/denzis-public-domain-art (public domain / CC0; verify the licence per sheet).
- The renderer is a WebGL2 SDF instanced renderer (`src/client/gl/`). Sprites need a texture atlas path with UV per instance, and possibly a separate pass.
- Keep the SDF overlays (selection rings, HP, tracers, statuses) on top of the sprites.
- Check the style fit against the art preamble draft ("baroque, grimdark, action-packed"), which B is still trying out.
- Check readability at the fit-all zoom on 390px phones; the sprites are small pixel art, so scaling may need nearest-neighbour filtering.
