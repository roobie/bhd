// Wave schedule. Owner: lane-waves. PLACEHOLDER composition: 15 waves, a Boss on every 5th, the
// roster widening and the counts climbing. Wave n starts at firstDelay + (n - 1) * interval seconds.

import type { WaveDef, WaveSchedule } from './types.ts';

export function defaultWaves(): WaveSchedule {
  const waves: WaveDef[] = [
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
        { def: 'grunt', count: 6, gap: 1 },
      ],
    },
    {
      spawns: [
        { def: 'runner', count: 12, gap: 0.4 },
        { def: 'grunt', count: 8, gap: 0.8 },
      ],
    },
    {
      spawns: [
        { def: 'brute', count: 3, gap: 2.5 },
        { def: 'grunt', count: 10, gap: 0.8 },
      ],
    },
    {
      spawns: [
        { def: 'runner', count: 10, gap: 0.4 },
        { def: 'brute', count: 4, gap: 2 },
        { def: 'grunt', count: 10, gap: 0.7 },
      ],
    },
    {
      spawns: [
        { def: 'grunt', count: 20, gap: 0.6 },
        { def: 'brute', count: 4, gap: 2 },
      ],
    },
    {
      spawns: [
        { def: 'boss', count: 1, gap: 0 },
        { def: 'brute', count: 4, gap: 2 },
        { def: 'runner', count: 10, gap: 0.5 },
      ],
    },
    {
      spawns: [
        { def: 'runner', count: 16, gap: 0.3 },
        { def: 'grunt', count: 15, gap: 0.6 },
        { def: 'brute', count: 3, gap: 3 },
      ],
    },
    {
      spawns: [
        { def: 'brute', count: 8, gap: 1.5 },
        { def: 'grunt', count: 15, gap: 0.6 },
      ],
    },
    {
      spawns: [
        { def: 'runner', count: 20, gap: 0.3 },
        { def: 'brute', count: 6, gap: 1.5 },
        { def: 'grunt', count: 15, gap: 0.5 },
      ],
    },
    {
      spawns: [
        { def: 'grunt', count: 25, gap: 0.5 },
        { def: 'brute', count: 8, gap: 1.5 },
      ],
    },
    {
      spawns: [
        { def: 'boss', count: 2, gap: 8 },
        { def: 'brute', count: 8, gap: 1.5 },
        { def: 'runner', count: 20, gap: 0.3 },
        { def: 'grunt', count: 20, gap: 0.5 },
      ],
    },
  ];
  return { firstDelay: 5, interval: 20, waves };
}
