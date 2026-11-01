import { expect, test as it } from 'vitest';
import { pushSample, scoreBars, secondsText, sparkPoints } from '../../src/client/panelmath.ts';

it('scoreBars scales to the largest magnitude and flags the pick', () => {
  const bars = scoreBars(
    [
      { id: 'a', score: 2 },
      { id: 'b', score: -1 },
    ],
    'a',
  );
  expect(bars.map((b) => b.frac)).toEqual([1, 0.5]);
  expect(bars.map((b) => b.negative)).toEqual([false, true]);
  expect(bars.map((b) => b.picked)).toEqual([true, false]);
  expect(scoreBars([{ id: 'z', score: 0 }], 'z')[0]?.frac).toBe(0);
  expect(scoreBars([], 'x')).toEqual([]);
});

it('sparkPoints spans the box, clamps and handles empty input', () => {
  expect(sparkPoints([], 100, 10)).toBe('');
  expect(sparkPoints([0, 1], 100, 10)).toBe('0.0,10.0 100.0,0.0');
  expect(sparkPoints([5, -5, Number.NaN], 20, 10)).toBe('0.0,0.0 10.0,10.0 20.0,10.0');
  expect(sparkPoints([0.5], 100, 10)).toBe('0.0,5.0');
});

it('pushSample keeps the last samples; secondsText never goes negative', () => {
  const h: number[] = [];
  for (let i = 0; i < 5; i++) {
    pushSample(h, i, 3);
  }
  expect(h).toEqual([2, 3, 4]);
  expect(secondsText(45)).toBe('1.5s');
  expect(secondsText(-3)).toBe('0.0s');
});
