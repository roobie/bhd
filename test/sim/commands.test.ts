import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/sim/commands.ts';
import { canonicalCommand, isValidCommand } from '../../src/sim/commands.ts';

const VALID: readonly Command[] = [
  { kind: 'move', hero: 2, x: 1.5, y: -3 },
  { kind: 'stop', hero: 2 },
  { kind: 'hold', hero: 2, on: true },
  { kind: 'ability', hero: 2, slot: 0 },
  { kind: 'ability', hero: 2, slot: 3, x: 1, y: 2 },
  { kind: 'ability', hero: 2, slot: 1, target: 7 },
  { kind: 'ability', hero: 2, slot: 2, x: 1, y: 2, target: 7 },
  { kind: 'autocast', hero: 2, slot: 3, on: false },
  { kind: 'spawn', def: 'grunt', x: 0, y: 0 },
];

function bad(cmd: Record<string, unknown>): Command {
  return cmd as unknown as Command;
}

const NEGATIVE_ZERO: readonly Command[] = [
  { kind: 'move', hero: -0, x: -0, y: -0 },
  { kind: 'stop', hero: -0 },
  { kind: 'hold', hero: -0, on: true },
  { kind: 'ability', hero: -0, slot: -0, x: -0, y: -0, target: -0 },
  { kind: 'autocast', hero: -0, slot: -0, on: false },
  { kind: 'spawn', def: 'grunt', x: -0, y: -0 },
];

const INVALID: readonly (readonly [string, Command])[] = [
  ['unknown kind', bad({ kind: 'dance', hero: 2 })],
  ['NaN coordinate', { kind: 'move', hero: 2, x: Number.NaN, y: 0 }],
  ['infinite coordinate', { kind: 'move', hero: 2, x: 0, y: Number.POSITIVE_INFINITY }],
  ['fractional hero id', { kind: 'move', hero: 1.5, x: 0, y: 0 }],
  ['negative hero id', { kind: 'stop', hero: -1 }],
  ['string hero id', bad({ kind: 'stop', hero: '2' })],
  ['hold without a boolean', bad({ kind: 'hold', hero: 2, on: 1 })],
  ['slot 4', { kind: 'ability', hero: 2, slot: 4 }],
  ['negative slot', { kind: 'ability', hero: 2, slot: -1 }],
  ['fractional slot', { kind: 'autocast', hero: 2, slot: 0.5, on: true }],
  ['ability x without y', { kind: 'ability', hero: 2, slot: 0, x: 1 }],
  ['ability y without x', { kind: 'ability', hero: 2, slot: 0, y: 1 }],
  ['ability NaN target point', { kind: 'ability', hero: 2, slot: 0, x: Number.NaN, y: 0 }],
  ['ability fractional target', { kind: 'ability', hero: 2, slot: 0, target: 1.5 }],
  ['autocast without a boolean', bad({ kind: 'autocast', hero: 2, slot: 0 })],
  ['spawn with empty def', { kind: 'spawn', def: '', x: 0, y: 0 }],
  ['spawn with non-string def', bad({ kind: 'spawn', def: 5, x: 0, y: 0 })],
  ['spawn with NaN position', { kind: 'spawn', def: 'grunt', x: 0, y: Number.NaN }],
];

describe('isValidCommand', () => {
  it.each(VALID.map((c) => [c.kind, c] as const))('accepts a well-formed %s', (_kind, cmd) => {
    expect(isValidCommand(cmd)).toBe(true);
  });

  it.each(INVALID)('rejects %s', (_name, cmd) => {
    expect(isValidCommand(cmd)).toBe(false);
  });
});

describe('canonicalCommand', () => {
  it.each(VALID.map((c) => [c.kind, c] as const))('keeps a %s that has no -0 unchanged', (_kind, cmd) => {
    expect(canonicalCommand(cmd)).toEqual(cmd);
  });

  it('returns a copy', () => {
    const cmd: Command = { kind: 'move', hero: 2, x: 1, y: 2 };
    expect(canonicalCommand(cmd)).not.toBe(cmd);
  });

  it('turns -0 into 0 in every numeric field', () => {
    for (const cmd of NEGATIVE_ZERO) {
      const numbers = Object.values(canonicalCommand(cmd)).filter((v) => typeof v === 'number');
      expect(numbers.length).toBeGreaterThan(0);
      expect(numbers.filter((v) => Object.is(v, -0))).toEqual([]);
    }
  });

  it('survives a JSON round trip bit for bit', () => {
    for (const cmd of NEGATIVE_ZERO) {
      const canon = canonicalCommand(cmd);
      const wire: unknown = JSON.parse(JSON.stringify(canon));
      expect(wire).toEqual(canon);
    }
  });

  it('omits absent optional ability fields', () => {
    expect(Object.keys(canonicalCommand({ kind: 'ability', hero: 2, slot: 1 }))).toEqual(['kind', 'hero', 'slot']);
  });
});
