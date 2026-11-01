// Lane map. Owner: lane-waves. Placeholder geometry.

import type { MapDef } from './types.ts';

export function defaultMap(): MapDef {
  return {
    width: 100,
    height: 40,
    lane: [
      { x: 0, y: 20 },
      { x: 30, y: 20 },
      { x: 30, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 30 },
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
