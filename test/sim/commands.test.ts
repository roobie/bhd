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
  { kind: 'intent', op: 'post', hero: 2, slot: 1, intentKind: 'pull', x: 3, y: 4, fireIn: 20 },
  { kind: 'intent', op: 'reserve', hero: 3, intent: 1, slot: 0, offset: 0 },
  { kind: 'intent', op: 'cancel', hero: 3, intent: 1 },
  { kind: 'summon', def: 'grunt', count: 3 },
  { kind: 'send' },
  { kind: 'control', op: 'drive', slot: 2, by: 'human' },
  { kind: 'control', op: 'drive', slot: 0, by: 'bot' },
  { kind: 'control', op: 'bargainPolicy', policy: 'bots' },
  { kind: 'control', op: 'bargainPolicy', policy: 'human' },
  { kind: 'control', op: 'bargainPolicy', policy: 'off' },
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
  { kind: 'intent', op: 'post', hero: -0, slot: -0, intentKind: 'pull', x: -0, y: -0, fireIn: 5 },
  { kind: 'intent', op: 'reserve', hero: -0, intent: -0, slot: -0, offset: -0 },
  { kind: 'intent', op: 'cancel', hero: -0, intent: -0 },
  { kind: 'control', op: 'drive', slot: -0, by: 'bot' },
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
  ['intent with unknown op', bad({ kind: 'intent', op: 'nudge', hero: 2 })],
  ['post without an intent kind', bad({ kind: 'intent', op: 'post', hero: 2, slot: 0, x: 0, y: 0, fireIn: 5 })],
  [
    'post with an empty intent kind',
    { kind: 'intent', op: 'post', hero: 2, slot: 0, intentKind: '', x: 0, y: 0, fireIn: 5 },
  ],
  ['post with slot 4', { kind: 'intent', op: 'post', hero: 2, slot: 4, intentKind: 'a', x: 0, y: 0, fireIn: 5 }],
  [
    'post with NaN point',
    { kind: 'intent', op: 'post', hero: 2, slot: 0, intentKind: 'a', x: Number.NaN, y: 0, fireIn: 5 },
  ],
  ['post firing now', { kind: 'intent', op: 'post', hero: 2, slot: 0, intentKind: 'a', x: 0, y: 0, fireIn: 0 }],
  [
    'post with fractional fireIn',
    { kind: 'intent', op: 'post', hero: 2, slot: 0, intentKind: 'a', x: 0, y: 0, fireIn: 1.5 },
  ],
  ['reserve with negative offset', { kind: 'intent', op: 'reserve', hero: 3, intent: 1, slot: 0, offset: -1 }],
  ['reserve with fractional offset', { kind: 'intent', op: 'reserve', hero: 3, intent: 1, slot: 0, offset: 0.5 }],
  ['cancel without an intent id', bad({ kind: 'intent', op: 'cancel', hero: 3 })],
  ['control drive of slot 4', bad({ kind: 'control', op: 'drive', slot: 4, by: 'human' })],
  ['control drive by nobody', bad({ kind: 'control', op: 'drive', slot: 0, by: 'nobody' })],
  ['control drive without a driver', bad({ kind: 'control', op: 'drive', slot: 0 })],
  ['control with unknown policy', bad({ kind: 'control', op: 'bargainPolicy', policy: 'anyone' })],
  ['control with unknown op', bad({ kind: 'control', op: 'reboot' })],
  ['summon with empty def', { kind: 'summon', def: '', count: 1 }],
  ['summon of zero', { kind: 'summon', def: 'grunt', count: 0 }],
  ['summon of a fraction', { kind: 'summon', def: 'grunt', count: 1.5 }],
  ['summon of a huge count', { kind: 'summon', def: 'grunt', count: 1_000_000 }],
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
