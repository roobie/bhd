import { describe, expect, it } from 'vitest';
import { EntityStore } from '../src/sim/entities.ts';

function ids(store: EntityStore): number[] {
  return [...store.values()].map((e) => e.id);
}

describe('EntityStore', () => {
  it('assigns monotonic IDs starting at 1', () => {
    const s = new EntityStore();
    expect([s.add('dummy', 0, 0).id, s.add('dummy', 1, 1).id, s.add('dummy', 2, 2).id]).toEqual([1, 2, 3]);
    expect(s.nextId).toBe(4);
  });

  it('iterates in ID order and never reuses removed IDs', () => {
    const s = new EntityStore();
    for (let i = 0; i < 5; i++) {
      s.add('dummy', i, 0);
    }
    expect(s.remove(2)).toBe(true);
    expect(s.remove(4)).toBe(true);
    expect(s.remove(4)).toBe(false);
    expect(s.add('dummy', 9, 9).id).toBe(6);
    expect(ids(s)).toEqual([1, 3, 5, 6]);
    expect(s.size).toBe(4);
    expect(s.get(2)).toBeUndefined();
  });
});
