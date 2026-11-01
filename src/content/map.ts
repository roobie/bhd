// Lane map. Owner: lane-waves. Placeholder geometry, world units. A serpentine lane runs west to
// east (about 144 units): out of the west edge, up the north side, down through the middle, then
// a final straight into the Ancient on the east edge, where the heroes hold.

import type { MapDef } from './types.ts';

export function defaultMap(): MapDef {
  return {
    width: 100,
    height: 50,
    lane: [
      { x: 0, y: 20 },
      { x: 20, y: 20 },
      { x: 20, y: 8 },
      { x: 45, y: 8 },
      { x: 45, y: 40 },
      { x: 70, y: 40 },
      { x: 70, y: 30 },
      { x: 90, y: 30 },
    ],
    ancient: { x: 90, y: 30, radius: 2, maxHp: 20 },
    heroSpawns: [
      { x: 80, y: 28 },
      { x: 80, y: 32 },
      { x: 84, y: 26 },
      { x: 84, y: 34 },
    ],
  };
}
