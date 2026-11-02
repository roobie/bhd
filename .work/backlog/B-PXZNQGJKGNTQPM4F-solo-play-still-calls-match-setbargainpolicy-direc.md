---
created: 2026-11-02
---

# B-PXZNQGJKGNTQPM4F Solo play still calls match.setBargainPolicy directly instead of a control command

## Why
In solo play the shell sets the bargain policy on Match directly, outside the command stream, so a solo game with the toggle changed does not replay (B-E6AFQ5LENRZY2ANU).

## Notes
Route it through the driver as a control command like co-op does (D-VXJDVX4RFRWSLUQB). Check whether the driven-slot takeover has the same gap.
