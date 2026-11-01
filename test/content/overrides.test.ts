// Overrides: deep merge, id-keyed patches of arrays, unknown keys rejected, result validated.

import { describe, expect, it } from 'vitest';
import { defaultBotSetup } from '../../src/content/bots.ts';
import { defaultDirector } from '../../src/content/director.ts';
import { defaultMasterGame } from '../../src/content/index.ts';
import type { RunConfig } from '../../src/content/overrides.ts';
import { applyOverrides } from '../../src/content/overrides.ts';

const DIRECTOR = /director/u;
const DUPLICATE = /duplicate/u;

function base(): RunConfig {
  return { game: defaultMasterGame(), bots: defaultBotSetup(), director: defaultDirector() };
}

describe('applyOverrides', () => {
  it('returns the base when there is nothing to apply', () => {
    const b = base();
    expect(applyOverrides(b, undefined)).toBe(b);
    expect(applyOverrides(b, {})).toEqual(b);
  });

  it('merges nested objects and leaves siblings alone', () => {
    const b = base();
    const out = applyOverrides(b, { director: { tension: { peakAbove: 0.9 } } });
    expect(out.director?.tension.peakAbove).toBe(0.9);
    expect(out.director?.tension.relaxBelow).toBe(b.director?.tension.relaxBelow);
    expect(out.game).toEqual(b.game);
  });

  it('patches an array of {id} objects by id', () => {
    const b = base();
    const [other, target] = b.game.enemies;
    expect(target).toBeDefined();
    const out = applyOverrides(b, { game: { enemies: { [target?.id ?? '']: { maxHp: 12_345 } } } });
    expect(out.game.enemies).toHaveLength(b.game.enemies.length);
    expect(out.game.enemies[1]?.maxHp).toBe(12_345);
    expect(out.game.enemies[1]?.radius).toBe(target?.radius);
    expect(out.game.enemies[0]).toEqual(other);
  });

  it('merges into nested objects of an id-keyed element', () => {
    const b = base();
    const [hero] = b.game.heroes;
    const out = applyOverrides(b, { game: { heroes: { [hero?.id ?? '']: { attack: { range: 77 } } } } });
    expect(out.game.heroes[0]?.attack.range).toBe(77);
    expect(out.game.heroes[0]?.attack.damage).toBe(hero?.attack.damage);
  });

  it('replaces a plain array whole', () => {
    const out = applyOverrides(base(), { director: { mix: [{ def: 'grunt', weight: 1 }] } });
    expect(out.director?.mix).toEqual([{ def: 'grunt', weight: 1 }]);
  });

  it('adds doctrine weights for known kit keys', () => {
    const b = base();
    const key = Object.keys(b.bots.kitWeights)[0] ?? '';
    const out = applyOverrides(b, { bots: { doctrines: { greedy: { weights: { [key]: 3 } } } } });
    expect(out.bots.doctrines.find((d) => d.id === 'greedy')?.weights?.[key]).toBe(3);
  });

  it('does not touch its inputs', () => {
    const b = base();
    const before = JSON.stringify(b);
    applyOverrides(b, { game: { enemies: { grunt: { maxHp: 9 } } }, director: { maxPerThink: 1 } });
    expect(JSON.stringify(b)).toBe(before);
  });

  it.each([
    ['an unknown top-level key', { gaem: {} }],
    ['an unknown nested key', { director: { tension: { peakAbov: 1 } } }],
    ['an unknown id', { game: { enemies: { nonesuch: { maxHp: 1 } } } }],
    ['a type change', { director: { maxPerThink: 'many' } }],
    ['null', { director: { maxPerThink: null } }],
    ['an object over a scalar', { director: { maxPerThink: { a: 1 } } }],
    ['an id patch on an array without ids', { game: { map: { lane: { 0: { x: 1 } } } } }],
    ['an unknown doctrine weight', { bots: { doctrines: { greedy: { weights: { nonesuch: 1 } } } } }],
  ])('throws on %s', (_what, overrides) => {
    expect(() => applyOverrides(base(), overrides as never)).toThrow();
  });

  it('throws on a director patch without a Director', () => {
    const { director: _d, ...schedule } = base();
    expect(() => applyOverrides(schedule, { director: { maxPerThink: 1 } })).toThrow(DIRECTOR);
  });

  it('validates the merged game', () => {
    const b = base();
    const [a, c] = b.game.enemies;
    expect(() => applyOverrides(b, { game: { enemies: { [a?.id ?? '']: { id: c?.id ?? '' } } } })).toThrow(DUPLICATE);
    expect(() => applyOverrides(b, { game: { map: { width: Number.POSITIVE_INFINITY } } })).toThrow();
  });
});
