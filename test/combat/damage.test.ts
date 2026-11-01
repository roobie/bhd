import { describe, expect, it } from 'vitest';
import { dealDamage, heal } from '../../src/sim/combat.ts';
import { applyStatus } from '../../src/sim/statuses.ts';
import { rig } from './rig.ts';

describe('dealDamage basics', () => {
  it('subtracts hp, emits dmg with the final amount and the tags, returns the amount', () => {
    const { events, ctx, add } = rig();
    const src = add({ team: 0, kind: 'hero' });
    const foe = add();
    expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: 25, tags: ['ability:x'] })).toBe(25);
    expect(foe.hp).toBe(975);
    expect(events).toEqual([{ tick: 10, kind: 'dmg', src: src.id, dst: foe.id, amount: 25, tags: ['ability:x'] }]);
  });

  it('never removes the victim and records the first killer only', () => {
    const { sim, ctx, add } = rig();
    const a = add({ team: 0, kind: 'hero' });
    const b = add({ team: 0, kind: 'hero' });
    const foe = add();
    dealDamage(ctx, { src: a.id, dst: foe.id, amount: 2000, tags: [] });
    expect(sim.entities.get(foe.id)?.hp).toBeLessThanOrEqual(0);
    expect(ctx.killers.get(foe.id)).toBe(a.id);
    expect(dealDamage(ctx, { src: b.id, dst: foe.id, amount: 5, tags: [] })).toBe(0);
    expect(ctx.killers.get(foe.id)).toBe(a.id);
  });

  it('does nothing for missing victims, dead victims and non-positive amounts', () => {
    const { events, ctx, add } = rig();
    const src = add({ team: 0, kind: 'hero' });
    const foe = add();
    expect(dealDamage(ctx, { src: src.id, dst: 999, amount: 5, tags: [] })).toBe(0);
    expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: 0, tags: [] })).toBe(0);
    expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: -4, tags: [] })).toBe(0);
    expect(events).toEqual([]);
  });
});

describe('armour', () => {
  it('flat armour reduces the hit', () => {
    const { ctx, add } = rig();
    const src = add({ team: 0, kind: 'hero' });
    const foe = add({ armour: 4 });
    expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: 10, tags: [] })).toBe(6);
    expect(foe.hp).toBe(994);
  });

  it('never cuts a hit below 20% of raw (the floor)', () => {
    const { events, ctx, add } = rig();
    const src = add({ team: 0, kind: 'hero' });
    const foe = add({ armour: 50 });
    expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: 10, tags: [] })).toBe(2);
    expect(events[0]).toMatchObject({ amount: 2 });
  });

  it('pierce ignores armour', () => {
    const { ctx, add } = rig();
    const src = add({ team: 0, kind: 'hero' });
    const foe = add({ armour: 4 });
    expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: 10, tags: ['pierce'] })).toBe(10);
  });
});

describe('friendly fire', () => {
  it('same-team damage without ff is dropped: 0 dealt, no event, no hp change', () => {
    const { events, ctx, add } = rig();
    const a = add({ team: 0, kind: 'hero' });
    const b = add({ team: 0, kind: 'hero' });
    expect(dealDamage(ctx, { src: a.id, dst: b.id, amount: 30, tags: ['overpen'] })).toBe(0);
    expect(dealDamage(ctx, { src: a.id, dst: a.id, amount: 30, tags: [] })).toBe(0);
    expect(b.hp).toBe(1000);
    expect(events).toEqual([]);
  });

  it('same-team damage with ff lands (armour still applies) and carries the tags', () => {
    const { events, ctx, add } = rig();
    const a = add({ team: 0, kind: 'hero' });
    const b = add({ team: 0, kind: 'hero', armour: 3 });
    expect(dealDamage(ctx, { src: a.id, dst: b.id, amount: 30, tags: ['ff', 'overpen'] })).toBe(27);
    expect(events).toEqual([{ tick: 10, kind: 'dmg', src: a.id, dst: b.id, amount: 27, tags: ['ff', 'overpen'] }]);
  });

  it('a self hit never applies, even with ff', () => {
    const { events, ctx, add } = rig();
    const a = add({ team: 0, kind: 'hero' });
    expect(dealDamage(ctx, { src: a.id, dst: a.id, amount: 30, tags: ['ff'] })).toBe(0);
    expect(a.hp).toBe(1000);
    expect(events).toEqual([]);
  });

  it('ff does not matter across teams', () => {
    const { ctx, add } = rig();
    const a = add({ team: 0, kind: 'hero' });
    const foe = add();
    expect(dealDamage(ctx, { src: a.id, dst: foe.id, amount: 10, tags: ['ff'] })).toBe(10);
  });

  it('blocked friendly fire does not consume Marked', () => {
    const { ctx, add } = rig();
    const a = add({ team: 0, kind: 'hero' });
    const b = add({ team: 0, kind: 'hero' });
    applyStatus(ctx, b.id, { status: 'marked', src: a.id, durationTicks: 60, value: 0.5 });
    dealDamage(ctx, { src: a.id, dst: b.id, amount: 10, tags: [] });
    expect(b.statuses).toHaveLength(1);
  });
});

describe('statuses modify damage', () => {
  it('Marked: next hit +value, then consumed with a status off event', () => {
    const { events, ctx, add } = rig();
    const src = add({ team: 0, kind: 'hero' });
    const foe = add();
    applyStatus(ctx, foe.id, { status: 'marked', src: src.id, durationTicks: 120, value: 0.25 });
    events.length = 0;
    expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: 40, tags: [] })).toBe(50);
    expect(events.map((e) => e.kind)).toEqual(['status', 'dmg']);
    expect(events[0]).toEqual({ tick: 10, kind: 'status', dst: foe.id, status: 'marked', on: false, src: src.id });
    expect(foe.statuses).toEqual([]);
    expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: 40, tags: [] })).toBe(40);
  });

  it('Marked bonus is applied before armour, and Marked from two sources is not stacked', () => {
    const { ctx, add } = rig();
    const a = add({ team: 0, kind: 'hero' });
    const b = add({ team: 0, kind: 'hero' });
    const foe = add({ armour: 5 });
    applyStatus(ctx, foe.id, { status: 'marked', src: a.id, durationTicks: 120, value: 0.5 });
    applyStatus(ctx, foe.id, { status: 'marked', src: b.id, durationTicks: 120, value: 0.25 });
    // 40 * 1.5 = 60, minus 5 armour.
    expect(dealDamage(ctx, { src: a.id, dst: foe.id, amount: 40, tags: [] })).toBe(55);
    expect(foe.statuses).toEqual([]);
  });

  it('Exposed: removes armour while it lasts (floored at 0 armour)', () => {
    const { ctx, add } = rig();
    const src = add({ team: 0, kind: 'hero' });
    const foe = add({ armour: 6 });
    expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: 20, tags: [] })).toBe(14);
    applyStatus(ctx, foe.id, { status: 'exposed', src: src.id, durationTicks: 90, value: 5 });
    expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: 20, tags: [] })).toBe(19);
    applyStatus(ctx, foe.id, { status: 'exposed', src: src.id, durationTicks: 90, value: 50 });
    expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: 20, tags: [] })).toBe(20);
    expect(foe.statuses).toHaveLength(1);
  });

  it('Clumped: +value for line, cone and splash hits only; not consumed', () => {
    const { ctx, add } = rig();
    const src = add({ team: 0, kind: 'hero' });
    const foe = add();
    applyStatus(ctx, foe.id, { status: 'clumped', src: src.id, durationTicks: 60, value: 0.5 });
    for (const tag of ['line', 'cone', 'splash']) {
      expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: 10, tags: [tag] })).toBe(15);
    }
    expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: 10, tags: ['ability:x'] })).toBe(10);
    expect(foe.statuses).toHaveLength(1);
  });

  it('Marked + Clumped + Exposed in one hit: fixed order (marked, clumped, armour)', () => {
    const { ctx, add } = rig();
    const src = add({ team: 0, kind: 'hero' });
    const foe = add({ armour: 8 });
    // Apply in an order unlike the sorted one; the result must not depend on it.
    applyStatus(ctx, foe.id, { status: 'marked', src: src.id, durationTicks: 60, value: 0.5 });
    applyStatus(ctx, foe.id, { status: 'exposed', src: src.id, durationTicks: 60, value: 3 });
    applyStatus(ctx, foe.id, { status: 'clumped', src: src.id, durationTicks: 60, value: 0.2 });
    // 100 * 1.5 * 1.2 = 180, armour 8 - 3 = 5 -> 175.
    expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: 100, tags: ['splash'] })).toBeCloseTo(175, 9);
  });

  it('pierce still gets Marked and Clumped bonuses but skips armour and Exposed', () => {
    const { ctx, add } = rig();
    const src = add({ team: 0, kind: 'hero' });
    const foe = add({ armour: 8 });
    applyStatus(ctx, foe.id, { status: 'marked', src: src.id, durationTicks: 60, value: 0.5 });
    expect(dealDamage(ctx, { src: src.id, dst: foe.id, amount: 10, tags: ['pierce', 'line'] })).toBe(15);
  });

  it('leak is exact: no armour, no floor, no statuses, no ff check, nothing consumed', () => {
    const { events, ctx, add } = rig();
    const enemy = add({ armour: 0 });
    const ancient = ctx.entities.get(1);
    if (ancient === undefined) {
      throw new Error('no ancient');
    }
    ancient.armour = 99;
    applyStatus(ctx, 1, { status: 'marked', src: enemy.id, durationTicks: 60, value: 1 });
    applyStatus(ctx, 1, { status: 'clumped', src: enemy.id, durationTicks: 60, value: 1 });
    const before = ancient.hp;
    expect(dealDamage(ctx, { src: enemy.id, dst: 1, amount: 2, tags: ['leak', 'splash'] })).toBe(2);
    expect(ancient.hp).toBe(before - 2);
    expect(ancient.statuses.map((s) => s.status)).toEqual(['clumped', 'marked']);
    expect(events.at(-1)).toEqual({
      tick: 10,
      kind: 'dmg',
      src: enemy.id,
      dst: 1,
      amount: 2,
      tags: ['leak', 'splash'],
    });
    // Even a same-team leak (no ff tag) is exact.
    const friend = add({ team: 0, kind: 'hero', armour: 9 });
    expect(dealDamage(ctx, { src: 1, dst: friend.id, amount: 3, tags: ['leak'] })).toBe(3);
  });
});

describe('heal', () => {
  it('restores hp, caps at maxHp, emits the amount actually healed', () => {
    const { events, ctx, add } = rig();
    const healer = add({ team: 0, kind: 'hero' });
    const ally = add({ team: 0, kind: 'hero' });
    ally.hp = 900;
    expect(heal(ctx, { src: healer.id, dst: ally.id, amount: 60, tags: [] })).toBe(60);
    expect(heal(ctx, { src: healer.id, dst: ally.id, amount: 60, tags: [] })).toBe(40);
    expect(ally.hp).toBe(1000);
    expect(events).toEqual([
      { tick: 10, kind: 'heal', src: healer.id, dst: ally.id, amount: 60 },
      { tick: 10, kind: 'heal', src: healer.id, dst: ally.id, amount: 40 },
    ]);
  });

  it('is a no-op at full hp, on the dead, on missing units and for non-positive amounts', () => {
    const { events, ctx, add } = rig();
    const ally = add({ team: 0, kind: 'hero' });
    expect(heal(ctx, { src: 2, dst: ally.id, amount: 10, tags: [] })).toBe(0);
    ally.hp = 500;
    expect(heal(ctx, { src: 2, dst: ally.id, amount: 0, tags: [] })).toBe(0);
    expect(heal(ctx, { src: 2, dst: 999, amount: 10, tags: [] })).toBe(0);
    ally.hp = 0;
    expect(heal(ctx, { src: 2, dst: ally.id, amount: 10, tags: [] })).toBe(0);
    expect(events).toEqual([]);
  });

  it('heals same-team units (heal ignores ff)', () => {
    const { ctx, add } = rig();
    const ally = add({ team: 0, kind: 'hero' });
    ally.hp = 10;
    expect(heal(ctx, { src: ally.id, dst: ally.id, amount: 5, tags: [] })).toBe(5);
  });
});

describe('the Ancient', () => {
  it('is immune to ff, overpen and any non-leak damage, with no event', () => {
    const { events, ctx, add } = rig();
    const ancient = ctx.entities.get(1);
    if (ancient === undefined) {
      throw new Error('no ancient');
    }
    const hero = add({ team: 0, kind: 'hero' });
    const foe = add();
    const before = ancient.hp;
    for (const src of [hero.id, foe.id, ancient.id]) {
      for (const tags of [[], ['ff'], ['overpen'], ['ff', 'overpen', 'pierce']]) {
        expect(dealDamage(ctx, { src, dst: ancient.id, amount: 50, tags })).toBe(0);
      }
    }
    expect(ancient.hp).toBe(before);
    expect(events).toEqual([]);
    expect(dealDamage(ctx, { src: foe.id, dst: ancient.id, amount: 2, tags: ['leak'] })).toBe(2);
    expect(ancient.hp).toBe(before - 2);
  });

  it('cannot be healed', () => {
    const { events, ctx, add } = rig();
    const ancient = ctx.entities.get(1);
    if (ancient === undefined) {
      throw new Error('no ancient');
    }
    const foe = add();
    dealDamage(ctx, { src: foe.id, dst: ancient.id, amount: 2, tags: ['leak'] });
    const { hp } = ancient;
    events.length = 0;
    expect(heal(ctx, { src: 2, dst: ancient.id, amount: 5, tags: [] })).toBe(0);
    expect(ancient.hp).toBe(hp);
    expect(events).toEqual([]);
  });
});
