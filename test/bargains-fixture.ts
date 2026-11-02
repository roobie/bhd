// A test-only bargain pool and rules (not the shipped pool, which is slice B's). Valid against the
// default roster, so `validateGame` accepts it; engine specs and the determinism scenario share it.

import type { BargainsDef } from '../src/content/bargains.ts';
import type { GameConfig } from '../src/content/index.ts';
import { defaultGame } from '../src/content/index.ts';

/** The shipped game with bargains switched off (the default game has them on). */
export function noBargains(): GameConfig {
  const { bargains: _on, ...off } = defaultGame();
  return off;
}

export function testBargains(): BargainsDef {
  return {
    afterWaves: [1, 2],
    cards: 3,
    windowSeconds: 20,
    pauseWaves: false,
    declineAncientHeal: 0.04,
    pool: [
      {
        id: 'test-barrel',
        scope: 'hero',
        kit: 'gunner',
        gains: [{ kind: 'dealt', target: 'self', value: 1.4 }],
        costs: [{ kind: 'def', target: 'self', path: 'heat.decayPerSecond', op: 'mul', value: 0 }],
      },
      {
        id: 'test-hair-shirt',
        scope: 'hero',
        kit: 'penitent',
        gains: [{ kind: 'def', target: 'self', path: 'zeal.maxBonus', op: 'mul', value: 1.5 }],
        costs: [{ kind: 'healTaken', target: 'self', value: 0 }],
      },
      {
        id: 'test-tithe',
        scope: 'team',
        gains: [{ kind: 'ancientHeal', target: 'team', value: 0.25 }],
        costs: [{ kind: 'respawn', target: 'team', value: 1.5 }],
      },
      {
        id: 'test-horde',
        scope: 'team',
        gains: [{ kind: 'dealt', target: 'team', value: 1.2 }],
        costs: [
          { kind: 'waveExtra', target: 'team', def: 'runner', count: 2 },
          { kind: 'masterBudget', target: 'team', value: 3 },
        ],
      },
      {
        // Timed: covers the one wave after its offer, then the base values return.
        id: 'test-fleeting',
        scope: 'team',
        durationWaves: 1,
        gains: [{ kind: 'def', target: 'team', path: 'maxHp', op: 'mul', value: 1.5 }],
        costs: [{ kind: 'taken', target: 'team', value: 1.25 }],
      },
    ],
  };
}
