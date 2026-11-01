import { describe, expect, it } from 'vitest';
import type { NewEntity } from '../../src/sim/entities.ts';
import { EntityStore } from '../../src/sim/entities.ts';

function unit(x: number): NewEntity {
  return { kind: 'enemy', def: 'grunt', team: 1, x, y: 0, radius: 0.5, maxHp: 10, armour: 0, speed: 0.1 };
}

function ids(store: EntityStore): number[] {
  return [...store.values()].map((e) => e.id);
}

describe('EntityStore', () => {
  it('assigns monotonic IDs starting at 1', () => {
    const s = new EntityStore();
    expect([s.add(unit(0)).id, s.add(unit(1)).id, s.add(unit(2)).id]).toEqual([1, 2, 3]);
    expect(s.nextId).toBe(4);
  });

  it('fills the record from the init and starts at full hp, idle, with no statuses', () => {
    const e = new EntityStore().add(unit(3));
    expect(e).toMatchObject({
      kind: 'enemy',
      def: 'grunt',
      team: 1,
      x: 3,
      hp: 10,
      maxHp: 10,
      statuses: [],
      move: { mode: 'idle', tx: 3, ty: 0, waypoint: 0 },
      attack: { cooldown: 0, target: 0 },
    });
    expect(e.kit).toBeUndefined();
  });

  it('iterates in ID order and never reuses removed IDs', () => {
    const s = new EntityStore();
    for (let i = 0; i < 5; i++) {
      s.add(unit(i));
    }
    expect(s.remove(2)).toBe(true);
    expect(s.remove(4)).toBe(true);
    expect(s.remove(4)).toBe(false);
    expect(s.add(unit(9)).id).toBe(6);
    expect(ids(s)).toEqual([1, 3, 5, 6]);
    expect(s.size).toBe(4);
    expect(s.get(2)).toBeUndefined();
  });
});
