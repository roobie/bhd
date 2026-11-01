import { expect, test as it } from 'vitest';
import { createInstanceBuffer } from '../../../src/client/gl/instances.ts';
import { INSTANCE_FLOATS, SHAPE } from '../../../src/client/shell/types.ts';

const inst = (x: number) => ({
  x,
  y: 2,
  hw: 3,
  hh: 4,
  rot: 0.5,
  shape: SHAPE.box,
  color: [0.1, 0.2, 0.3, 0.4] as const,
  p0: 7,
  p1: 8,
});

it('packs the documented 12-float layout', () => {
  const b = createInstanceBuffer(1);
  b.push(inst(1));
  const d = b.data();
  expect(d.length).toBe(INSTANCE_FLOATS);
  expect(Array.from(d.slice(0, 6))).toEqual([1, 2, 3, 4, 0.5, SHAPE.box]);
  expect(d[10]).toBe(7);
  expect(d[11]).toBe(8);
  expect(d[9]).toBeCloseTo(0.4);
});

it('grows past capacity keeping order, and clear resets the count', () => {
  const b = createInstanceBuffer(2);
  for (let i = 0; i < 100; i += 1) {
    b.push(inst(i));
  }
  expect(b.count).toBe(100);
  expect(b.data().length).toBe(100 * INSTANCE_FLOATS);
  expect(b.data()[99 * INSTANCE_FLOATS]).toBe(99);
  expect(Array.from(b.data()).every(Number.isFinite)).toBe(true);
  b.clear();
  expect(b.count).toBe(0);
  expect(b.data().length).toBe(0);
});
