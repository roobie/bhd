// Engine spec of the bargains contract (wave 9 step 1): command shape, logged no-ops, config
// validation, equivalence with bargains off. No gameplay pinning (D-4E4QRJ7N6LIGZDSD).

import { describe, expect, it } from 'vitest';
import type { BargainsDef, Effect } from '../../src/content/bargains.ts';
import type { GameConfig } from '../../src/content/index.ts';
import { defaultGame, validateGame } from '../../src/content/index.ts';
import type { Command } from '../../src/sim/commands.ts';
import { canonicalCommand, isValidCommand } from '../../src/sim/commands.ts';
import { Sim } from '../../src/sim/sim.ts';
import { noBargains, testBargains } from '../bargains-fixture.ts';

function withBargains(over: Partial<BargainsDef> = {}): GameConfig {
  return { ...defaultGame(), bargains: { ...testBargains(), ...over } };
}

function withEffect(effect: Effect): GameConfig {
  const [first, ...rest] = testBargains().pool;
  if (first === undefined) {
    throw new Error('empty test pool');
  }
  return withBargains({ pool: [{ ...first, gains: [effect] }, ...rest] });
}

const DUPLICATE = /duplicate/u;
const KIT = /kit/u;
const CONFIG = /bargain|game config/u;

describe('bargain command shape', () => {
  it.each<[string, Command, boolean]>([
    ['accept', { kind: 'bargain', op: 'accept', offer: 1, card: 'test-barrel' }, true],
    ['decline', { kind: 'bargain', op: 'decline', offer: 1 }, true],
    ['accept without a card id', { kind: 'bargain', op: 'accept', offer: 1, card: '' }, false],
    ['negative offer', { kind: 'bargain', op: 'decline', offer: -1 }, false],
    ['fractional offer', { kind: 'bargain', op: 'decline', offer: 1.5 }, false],
    ['NaN offer', { kind: 'bargain', op: 'accept', offer: Number.NaN, card: 'x' }, false],
    ['unknown op', { kind: 'bargain', op: 'maybe', offer: 1 } as unknown as Command, false],
  ])('%s', (_name, cmd, ok) => {
    expect(isValidCommand(cmd)).toBe(ok);
  });

  it('canonical form turns -0 into 0 and survives JSON', () => {
    const canon = canonicalCommand({ kind: 'bargain', op: 'decline', offer: -0 });
    expect(Object.is((canon as { offer: number }).offer, -0)).toBe(false);
    expect(JSON.parse(JSON.stringify(canon))).toEqual(canon);
    expect(canonicalCommand({ kind: 'bargain', op: 'accept', offer: 2, card: 'c' })).toEqual({
      kind: 'bargain',
      op: 'accept',
      offer: 2,
      card: 'c',
    });
  });

  it('the sim rejects a malformed one at submission', () => {
    const sim = new Sim({ seed: 1, game: withBargains() });
    expect(sim.command(0, { kind: 'bargain', op: 'accept', offer: 1, card: '' })).toEqual({
      ok: false,
      reason: 'invalid',
    });
  });
});

describe('commands that resolve nothing', () => {
  it.each([true, false])('are logged and change no state (bargains configured: %s)', (configured) => {
    const game = configured ? withBargains() : defaultGame();
    const quiet = new Sim({ seed: 4, game });
    const poked = new Sim({ seed: 4, game });
    const cmds: Command[] = [
      { kind: 'bargain', op: 'accept', offer: 99, card: 'test-barrel' },
      { kind: 'bargain', op: 'accept', offer: 1, card: 'nonesuch' },
      { kind: 'bargain', op: 'decline', offer: 99 },
      { kind: 'bargain', op: 'decline', offer: 99 },
    ];
    for (const cmd of cmds) {
      expect(poked.command(0, cmd, 3).ok).toBe(true);
    }
    const logged: Command[] = [];
    const kinds = new Set<string>();
    for (let i = 0; i < 5; i++) {
      quiet.step();
      for (const e of poked.step()) {
        if (e.kind === 'cmd') {
          logged.push(e.cmd);
        }
        kinds.add(e.kind);
      }
    }
    expect(kinds.has('bargain')).toBe(false);
    expect(logged).toEqual(cmds.map(canonicalCommand));
    expect(poked.hash()).toBe(quiet.hash());
  });
});

describe('presence flag and equivalence', () => {
  it('a game with bargains has bargain state; one without has none', () => {
    expect(new Sim({ seed: 1, game: noBargains() }).bargains).toBeUndefined();
    expect(new Sim({ seed: 1, game: withBargains() }).bargains).toBeDefined();
  });

  it('bargains configured but nothing offered: same events as bargains off, state hash differs only by the flag', () => {
    const off = new Sim({ seed: 9, game: noBargains() });
    const on = new Sim({ seed: 9, game: withBargains({ afterWaves: [99] }) });
    for (let i = 0; i < 400; i++) {
      const strip = (s: Sim): unknown[] => s.step().filter((e) => e.kind !== 'hash');
      expect(strip(on)).toEqual(strip(off));
    }
    expect(on.hash()).not.toBe(off.hash());
  });
});

describe('validateGame: bargains', () => {
  it('accepts the test pool and a game without bargains', () => {
    expect(() => validateGame(withBargains())).not.toThrow();
    expect(() => validateGame(defaultGame())).not.toThrow();
  });

  it.each<[string, Effect]>([
    ['unknown hero def path', { kind: 'def', target: 'self', path: 'zeal.nonesuch', op: 'mul', value: 2 }],
    ['non-numeric def path', { kind: 'def', target: 'self', path: 'kit', op: 'mul', value: 2 }],
    ['inherited def path', { kind: 'def', target: 'self', path: 'constructor', op: 'mul', value: 2 }],
    ['an enemy def patch', { kind: 'def', target: 'team', path: 'maxHp', op: 'mul', value: 2, enemy: 'grunt' }],
    [
      'leak damage (hurts the Ancient)',
      { kind: 'def', target: 'team', path: 'leakDamage', op: 'mul', value: 2, enemy: 'grunt' },
    ],
    ['array length as a path', { kind: 'def', target: 'team', path: 'attack.length', op: 'mul', value: 2 }],
    [
      'a path only the card kit has, on team',
      { kind: 'def', target: 'team', path: 'heat.decayPerSecond', op: 'mul', value: 0 },
    ],
    ['unknown target', { kind: 'dealt', target: 'everyone', value: 2 } as unknown as Effect],
    ['ancientHeal of 0', { kind: 'ancientHeal', target: 'team', value: 0 }],
    ['negative ancientHeal (a hurt)', { kind: 'ancientHeal', target: 'team', value: -0.1 }],
    ['ancientHeal above max hp', { kind: 'ancientHeal', target: 'team', value: 2 }],
    ['non-finite multiplier', { kind: 'dealt', target: 'self', value: Number.POSITIVE_INFINITY }],
    ['negative multiplier', { kind: 'taken', target: 'self', value: -1 }],
    ['unknown waveExtra enemy', { kind: 'waveExtra', target: 'team', def: 'nonesuch', count: 1 }],
    ['zero waveExtra count', { kind: 'waveExtra', target: 'team', def: 'runner', count: 0 }],
    ['unknown effect kind', { kind: 'hurtAncient', target: 'team', value: 5 } as unknown as Effect],
  ])('rejects %s', (_name, effect) => {
    expect(() => validateGame(withEffect(effect))).toThrow(CONFIG);
  });

  it('accepts a positive ancientHeal and a hero patch', () => {
    expect(() => validateGame(withEffect({ kind: 'ancientHeal', target: 'team', value: 0.25 }))).not.toThrow();
    expect(() =>
      validateGame(withEffect({ kind: 'def', target: 'team', path: 'maxHp', op: 'add', value: 5 })),
    ).not.toThrow();
  });

  it('rejects a self target on a team-scope bargain, and a bad scope or kit', () => {
    const team = { id: 'x', scope: 'team', gains: [{ kind: 'dealt', target: 'self', value: 2 }], costs: [] } as const;
    expect(() => validateGame(withBargains({ pool: [team] }))).toThrow(CONFIG);
    const hero = { id: 'y', scope: 'hero', kit: 'wizard', gains: [], costs: [] };
    expect(() => validateGame(withBargains({ pool: [hero as unknown as BargainsDef['pool'][number]] }))).toThrow(
      CONFIG,
    );
    const scope = { id: 'z', scope: 'party', gains: [], costs: [] };
    expect(() => validateGame(withBargains({ pool: [scope as unknown as BargainsDef['pool'][number]] }))).toThrow(
      CONFIG,
    );
    expect(() => validateGame(withBargains({ windowSeconds: Number.POSITIVE_INFINITY }))).toThrow();
  });

  it('rejects an over-long card id in a command', () => {
    expect(isValidCommand({ kind: 'bargain', op: 'accept', offer: 1, card: 'x'.repeat(65) })).toBe(false);
  });

  it('rejects bad offer rules and pools', () => {
    expect(() => validateGame(withBargains({ afterWaves: [3, 3] }))).toThrow();
    expect(() => validateGame(withBargains({ afterWaves: [0] }))).toThrow();
    expect(() => validateGame(withBargains({ cards: 0 }))).toThrow();
    expect(() => validateGame(withBargains({ windowSeconds: 0 }))).toThrow();
    expect(() => validateGame(withBargains({ declineAncientHeal: 2 }))).toThrow();
    const [first] = testBargains().pool;
    if (first === undefined) {
      throw new Error('empty test pool');
    }
    expect(() => validateGame(withBargains({ pool: [first, first] }))).toThrow(DUPLICATE);
    expect(() => validateGame(withBargains({ pool: [{ id: 'solo', scope: 'hero', gains: [], costs: [] }] }))).toThrow(
      KIT,
    );
  });
});
