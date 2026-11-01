import { describe, expect, it } from 'vitest';
import { perTick, TICK_HZ, ticks } from '../../src/sim/time.ts';

describe('time helpers', () => {
  it('runs at 30 Hz', () => {
    expect(TICK_HZ).toBe(30);
  });

  it('ticks() gives whole ticks, rounded to nearest', () => {
    expect(ticks(1)).toBe(30);
    expect(ticks(0.25)).toBe(8);
    expect(ticks(0.5)).toBe(15);
    expect(ticks(1 / 30)).toBe(1);
    expect(ticks(0.016)).toBe(0);
    expect(ticks(0.017)).toBe(1);
    expect(Number.isInteger(ticks(2.3456))).toBe(true);
  });

  it('ticks() is never negative', () => {
    expect(ticks(-3)).toBe(0);
    expect(ticks(0)).toBe(0);
  });

  it('perTick() divides a per-second rate by the tick rate', () => {
    expect(perTick(30)).toBe(1);
    expect(perTick(6)).toBe(0.2);
    expect(perTick(0)).toBe(0);
  });
});
