import { describe, expect, it } from 'vitest';
import type { NewEntity, Team } from '../../src/sim/entities.ts';
import { EntityStore } from '../../src/sim/entities.ts';
import { nearestHostile, unitsInRadius, unitsOnSegment } from '../../src/sim/query.ts';

function at(x: number, y: number, team: Team = 1, radius = 0): NewEntity {
  return { kind: 'enemy', def: 'grunt', team, x, y, radius, maxHp: 1, armour: 0, speed: 0 };
}

function store(...units: NewEntity[]): EntityStore {
  const s = new EntityStore();
  for (const u of units) {
    s.add(u);
  }
  return s;
}

function segIds(hits: readonly { readonly unit: { readonly id: number } }[]): number[] {
  return hits.map((h) => h.unit.id);
}

function ids(units: readonly { readonly id: number }[]): number[] {
  return units.map((u) => u.id);
}

describe('unitsInRadius', () => {
  it('returns units in ascending ID order, boundary inclusive', () => {
    const s = store(at(5, 0), at(1, 0), at(3, 4), at(0, 0), at(6, 0));
    expect(ids(unitsInRadius(s, { x: 0, y: 0 }, 5))).toEqual([1, 2, 3, 4]);
  });

  it('counts bodies: a unit is hit when its edge reaches the circle', () => {
    const s = store(at(5.5, 0, 1, 0.5), at(5.6, 0, 1, 0.5));
    expect(ids(unitsInRadius(s, { x: 0, y: 0 }, 5))).toEqual([1]);
  });

  it('filters by team when asked', () => {
    const s = store(at(1, 0, 0), at(2, 0, 1), at(3, 0, 0));
    expect(ids(unitsInRadius(s, { x: 0, y: 0 }, 10, 0))).toEqual([1, 3]);
    expect(ids(unitsInRadius(s, { x: 0, y: 0 }, 10, 1))).toEqual([2]);
    expect(ids(unitsInRadius(s, { x: 0, y: 0 }, 10))).toEqual([1, 2, 3]);
  });

  it('skips removed entities', () => {
    const s = store(at(1, 0), at(2, 0), at(3, 0));
    s.remove(2);
    expect(ids(unitsInRadius(s, { x: 0, y: 0 }, 10))).toEqual([1, 3]);
  });
});

describe('nearestHostile', () => {
  const me = { x: 0, y: 0, team: 0 } as const;

  it('picks the nearest unit of the other team', () => {
    const s = store(at(1, 0, 0), at(9, 0), at(4, 0), at(6, 0));
    expect(nearestHostile(s, me, 20)?.id).toBe(3);
  });

  it('breaks exact ties by the lower ID, whatever the position order', () => {
    const s = store(at(0, 5), at(5, 0), at(-5, 0), at(0, -5));
    expect(nearestHostile(s, me, 10)?.id).toBe(1);
    const t = store(at(3, 0, 0), at(0, 4), at(0, -4), at(4, 0));
    t.remove(2);
    expect(nearestHostile(t, me, 10)?.id).toBe(3);
  });

  it('returns undefined when nothing hostile is in range', () => {
    const s = store(at(10, 0), at(1, 0, 0));
    expect(nearestHostile(s, me, 5)).toBeUndefined();
    expect(nearestHostile(store(), me, 5)).toBeUndefined();
  });

  it('range includes the target body', () => {
    const s = store(at(5.4, 0, 1, 0.5));
    expect(nearestHostile(s, me, 5)?.id).toBe(1);
  });
});

describe('unitsOnSegment', () => {
  it('finds units of any team along the segment, ordered by position along it, ignoring those past its ends', () => {
    const s = store(at(8, 0.5, 0), at(2, 0), at(5, 3), at(12, 0), at(-2, 0), at(6, -0.9));
    expect(segIds(unitsOnSegment(s, { x: 0, y: 0 }, { x: 10, y: 0 }, 1))).toEqual([2, 6, 1]);
  });

  it('includes unit bodies and measures to the nearest point of the segment', () => {
    const s = store(at(11, 0, 1, 1), at(11, 0, 1, 0.5));
    expect(segIds(unitsOnSegment(s, { x: 0, y: 0 }, { x: 10, y: 0 }, 0))).toEqual([1]);
  });

  it('works for diagonal segments', () => {
    const s = store(at(5, 5), at(5, 6), at(5, 7));
    expect(segIds(unitsOnSegment(s, { x: 0, y: 0 }, { x: 10, y: 10 }, 1))).toEqual([1, 2]);
  });

  it('treats a zero-length segment as a point', () => {
    const s = store(at(1, 1), at(3, 0));
    expect(segIds(unitsOnSegment(s, { x: 0, y: 0 }, { x: 0, y: 0 }, 2))).toEqual([1]);
  });
});

describe('unitsOnSegment ordering and t', () => {
  it('orders by t then ID and reports t', () => {
    const s = store(at(6, 0), at(2, 0), at(6, 0.5), at(10, 0));
    const hits = unitsOnSegment(s, { x: 0, y: 0 }, { x: 10, y: 0 }, 1);
    expect(segIds(hits)).toEqual([2, 1, 3, 4]);
    expect(hits.map((h) => h.t)).toEqual([0.2, 0.6, 0.6, 1]);
  });

  it('includes the shooter and every team', () => {
    const s = store(at(0, 0, 0), at(3, 0, 1), at(6, 0, 0));
    expect(segIds(unitsOnSegment(s, { x: 0, y: 0 }, { x: 10, y: 0 }, 0.5))).toEqual([1, 2, 3]);
  });
});

describe('dead units (hp <= 0, not yet removed)', () => {
  function withCorpse(): EntityStore {
    const s = store(at(1, 0), at(2, 0), at(3, 0));
    const corpse = s.get(1);
    if (corpse === undefined) {
      throw new Error('missing');
    }
    corpse.hp = 0;
    return s;
  }

  it('are skipped by unitsInRadius', () => {
    expect(ids(unitsInRadius(withCorpse(), { x: 0, y: 0 }, 10))).toEqual([2, 3]);
  });

  it('are skipped by nearestHostile', () => {
    expect(nearestHostile(withCorpse(), { x: 0, y: 0, team: 0 }, 10)?.id).toBe(2);
  });

  it('are skipped by unitsOnSegment', () => {
    expect(segIds(unitsOnSegment(withCorpse(), { x: 0, y: 0 }, { x: 10, y: 0 }, 1))).toEqual([2, 3]);
  });
});
