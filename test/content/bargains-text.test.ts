// Invariants of who a bargain effect reaches and of the generated card text. No tuned numbers: the
// phrasing is checked against the defs it is computed from.

import { describe, expect, it } from 'vitest';
import type { Effect } from '../../src/content/bargains.ts';
import { defNumberAt, effectiveDef, effectReaches } from '../../src/content/bargains.ts';
import { describeBargain } from '../../src/content/help.ts';
import { defaultGame } from '../../src/content/index.ts';
import type { EffectView } from '../../src/perception/types.ts';

const NEVER_COOLS = /never cools/iu;

const patch = (target: 'self' | 'team' | 'allies', value: number): Effect => ({
  kind: 'def',
  target,
  path: 'attack.damage',
  op: 'mul',
  value,
});

describe('effectReaches', () => {
  it('on a team card (benefit 0) every target reaches every hero', () => {
    for (const target of ['self', 'team', 'allies'] as const) {
      expect([2, 3, 4].map((h) => effectReaches(target, 0, h))).toEqual([true, true, true]);
    }
  });

  it('on a hero card self is that hero, allies the others, team all', () => {
    expect([2, 3, 4].map((h) => effectReaches('self', 3, h))).toEqual([false, true, false]);
    expect([2, 3, 4].map((h) => effectReaches('allies', 3, h))).toEqual([true, false, true]);
    expect([2, 3, 4].map((h) => effectReaches('team', 3, h))).toEqual([true, true, true]);
  });
});

describe('effectiveDef', () => {
  const def = { attack: { damage: 10 } };
  const taken = [
    { hero: 3, effects: [patch('self', 2)] },
    { hero: 4, effects: [patch('allies', 3)] },
  ];

  it('applies only the patches that reach the hero, in order', () => {
    expect(effectiveDef(def, taken, 3).attack.damage).toBe(10 * 2 * 3);
    expect(effectiveDef(def, taken, 4).attack.damage).toBe(10);
    expect(effectiveDef(def, taken, 9).attack.damage).toBe(10 * 3);
  });

  it('is the same object when nothing applies', () => {
    expect(effectiveDef(def, [], 3)).toBe(def);
    expect(effectiveDef(def, taken, 4)).toBe(def);
  });
});

describe('describeBargain with a known base', () => {
  const psyker = defaultGame().heroes.find((h) => h.kit === 'psyker');
  const view = (path: string, op: 'mul' | 'add', value: number): EffectView => ({
    kind: 'def',
    target: 'self',
    value,
    path,
    op,
    def: '',
  });
  const facts = {
    scope: 'hero' as const,
    enemy: (id: string) => id,
    base: (e: EffectView) => (psyker === undefined ? undefined : defNumberAt(psyker, e.path)),
  };

  it('names the old and the new number, both computed from the def', () => {
    const from = psyker === undefined ? undefined : defNumberAt(psyker, 'backlash.freeBelow');
    expect(from).toBeDefined();
    const { costs } = describeBargain({ gains: [], costs: [view('backlash.freeBelow', 'mul', 0.6)] }, facts);
    expect(costs).toEqual([`Backlash starts at ${Math.round((from ?? 0) * 6) / 10} Warp (was ${from})`]);
  });

  it('reads a removed knob in words, with or without a base', () => {
    const zero = view('heat.decayPerSecond', 'mul', 0);
    for (const f of [facts, { scope: 'hero' as const, enemy: (id: string) => id }]) {
      const { costs } = describeBargain({ gains: [], costs: [zero] }, f);
      expect(costs[0]).toMatch(NEVER_COOLS);
    }
  });
});
