// Invariants of the shipped bargain pool (wave 9 slice B). No gameplay pinning: no tuned numbers.

import { describe, expect, it } from 'vitest';
import { defaultBargains } from '../../src/content/bargains/pool.ts';
import { gunnerDef } from '../../src/content/heroes/gunner.ts';
import { defaultGame, validateGame } from '../../src/content/index.ts';
import { dmgFrom, fastHeat, gunnerRig } from '../gunner/rig.ts';

const { pool } = defaultBargains();

describe('shipped bargain pool', () => {
  it('validates with the pool on', () => {
    expect(() => validateGame({ ...defaultGame(), bargains: defaultBargains() })).not.toThrow();
  });

  it('has unique ids', () => {
    expect(new Set(pool.map((b) => b.id)).size).toBe(pool.length);
  });

  it.each(pool.map((b) => [b.id, b] as const))('%s has a gain and a cost', (_id, b) => {
    expect(b.gains.length).toBeGreaterThan(0);
    expect(b.costs.length).toBeGreaterThan(0);
  });

  it('only heals the Ancient, never touches it otherwise', () => {
    const effects = pool.flatMap((b) => [...b.gains, ...b.costs]);
    const heals = effects.filter((e) => e.kind === 'ancientHeal');
    expect(heals.every((e) => e.value > 0)).toBe(true);
    const leaks = effects.filter((e) => e.kind === 'def' && e.path.startsWith('leakDamage'));
    expect(leaks).toEqual([]);
  });
});

describe('overpenAllies knob', () => {
  const volley = (flag: number | undefined) => {
    const base = fastHeat();
    const def = flag === undefined ? base : { ...base, heat: { ...base.heat, overpenAllies: flag } };
    const r = gunnerRig(def);
    r.dummy(5, 0);
    const friend = r.ally(7, 0);
    const hits = dmgFrom(r.step(60)).filter((h) => h.tags.includes('overpen'));
    return { hits, friend: friend.id };
  };

  it('defaults to hitting allies, and an explicit default changes nothing', () => {
    expect(gunnerDef().heat.overpenAllies).toBe(1);
    const a = volley(undefined);
    const b = volley(1);
    expect(b.hits).toEqual(a.hits);
    expect(a.hits.some((h) => h.dst === a.friend)).toBe(true);
  });

  it('at 0 the line spares allies but still hits enemies', () => {
    const v = volley(0);
    expect(v.hits.length).toBeGreaterThan(0);
    expect(v.hits.some((h) => h.dst === v.friend)).toBe(false);
  });
});
