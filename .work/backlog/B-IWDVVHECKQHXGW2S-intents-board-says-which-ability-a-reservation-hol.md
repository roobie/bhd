---
created: 2026-11-01
---

# B-IWDVVHECKQHXGW2S Intents board says which ability a reservation holds

## Why
The board does not record which ability a reservation holds, so the Gunner charges both Vent and Furnace Heart while it holds any reservation.

## Notes
Needs a field on the reserve command, board state (hashed) and IntentView; the golden changes. See src/intents/board.ts.
