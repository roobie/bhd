// Wave schedule. Owner: lane-waves. PLACEHOLDER composition.

import type { WaveSchedule } from './types.ts';

export function defaultWaves(): WaveSchedule {
  return {
    firstDelay: 5,
    interval: 20,
    waves: [
      { spawns: [{ def: 'grunt', count: 5, gap: 1 }] },
      {
        spawns: [
          { def: 'runner', count: 6, gap: 0.5 },
          { def: 'grunt', count: 3, gap: 1 },
        ],
      },
      { spawns: [{ def: 'grunt', count: 10, gap: 0.8 }] },
      {
        spawns: [
          { def: 'brute', count: 2, gap: 3 },
          { def: 'grunt', count: 6, gap: 1 },
        ],
      },
      {
        spawns: [
          { def: 'boss', count: 1, gap: 0 },
          { def: 'grunt', count: 4, gap: 1 },
        ],
      },
    ],
  };
}
