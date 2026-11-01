// Utility scoring invariants (wave w2-bots DESIGN "Utility framework"): fixed option order, ties to
// the first, stickiness, noise draws only when asked, finite scores without -0 (L-BUDC4M5PFNLU2NTN).

import { describe, expect, it } from 'vitest';
import type { Decision, Option } from '../../src/bots/types.ts';
import { decide, weight } from '../../src/bots/utility.ts';
import { cloneRng, createRng, nextFloat, nextU32 } from '../../src/detmath/index.ts';

function opt(id: string, value: number, cost = 0): Option {
  return { id, value, cost, commands: [] };
}

const none = { stickiness: 0, noise: 0 };

describe('decide', () => {
  it('scores value minus cost, in option order, and picks the highest', () => {
    const d: Decision = { id: 'd', options: [opt('a', 1, 0.25), opt('b', 2, 1.5), opt('c', 0.5)] };
    const pick = decide(d, none, createRng(1), undefined);
    expect(pick.scores).toEqual([0.75, 0.5, 0.5]);
    expect(pick.option.id).toBe('a');
    expect(pick.index).toBe(0);
  });

  it('breaks ties toward the first option', () => {
    const d: Decision = { id: 'd', options: [opt('a', 1), opt('b', 1), opt('c', 1)] };
    expect(decide(d, none, createRng(1), undefined).option.id).toBe('a');
  });

  it('adds stickiness to the previous pick only', () => {
    const d: Decision = { id: 'd', options: [opt('a', 1), opt('b', 0.8)] };
    expect(decide(d, { stickiness: 0.5, noise: 0 }, createRng(1), 'b').scores).toEqual([1, 1.3]);
    expect(decide(d, { stickiness: 0.5, noise: 0 }, createRng(1), 'b').option.id).toBe('b');
    expect(decide(d, { stickiness: 0.5, noise: 0 }, createRng(1), 'zzz').option.id).toBe('a');
  });

  it('draws no random numbers without noise, and one per option in order with noise', () => {
    const d: Decision = { id: 'd', options: [opt('a', 0), opt('b', 0)] };
    const quiet = createRng(5);
    const probe = cloneRng(quiet);
    decide(d, none, quiet, undefined);
    expect(nextU32(quiet)).toBe(nextU32(probe));

    const noisy = createRng(5);
    const mirror = cloneRng(noisy);
    const pick = decide(d, { stickiness: 0, noise: 2 }, noisy, undefined);
    expect(pick.scores).toEqual([2 * nextFloat(mirror), 2 * nextFloat(mirror)]);
    expect(nextU32(noisy)).toBe(nextU32(mirror));
  });

  it('never returns a non-finite score or -0', () => {
    const d: Decision = {
      id: 'd',
      options: [opt('nan', Number.NaN), opt('inf', Number.POSITIVE_INFINITY), opt('zero', -0), opt('ok', 1)],
    };
    const { scores, option } = decide(d, none, createRng(1), undefined);
    expect(scores.every((s) => Number.isFinite(s))).toBe(true);
    expect(scores.some((s) => Object.is(s, -0))).toBe(false);
    expect(option.id).toBe('ok');
  });

  it('rejects a decision without options', () => {
    expect(() => decide({ id: 'd', options: [] }, none, createRng(1), undefined)).toThrow(RangeError);
  });
});

describe('weight', () => {
  it('reads by key with a fallback', () => {
    expect(weight({ k: 3 }, 'k', 9)).toBe(3);
    expect(weight({ k: 3 }, 'other', 9)).toBe(9);
  });
});
