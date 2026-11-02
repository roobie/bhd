// Hand-built Perception with an open bargain offer, for the HUD specs (slice A's sim engine does not
// open offers yet; the views are the contract in src/perception/types.ts).

import type { ControlState, HudInput } from '../../../src/client/shell/types.ts';
import type { BargainsDef } from '../../../src/content/bargains.ts';
import { defaultGame } from '../../../src/content/index.ts';
import { defaultPerception } from '../../../src/content/perception.ts';
import { defaultPresentation } from '../../../src/content/presentation.ts';
import { createMemory } from '../../../src/perception/memory.ts';
import { perceive } from '../../../src/perception/perceive.ts';
import type { CardView, EffectView, Perception } from '../../../src/perception/types.ts';
import { Sim } from '../../../src/sim/sim.ts';
import { TICK_HZ } from '../../../src/sim/time.ts';

export const WINDOW_SECONDS = 20;

function effect(
  kind: EffectView['kind'],
  target: EffectView['target'],
  value: number,
  over: Partial<EffectView> = {},
): EffectView {
  return { kind, target, value, path: '', op: '', def: '', ...over };
}

const bargainsDef: BargainsDef = {
  afterWaves: [3, 6],
  cards: 3,
  windowSeconds: WINDOW_SECONDS,
  pauseWaves: false,
  declineAncientHeal: 0.04,
  pool: [],
};

const plain: Perception = perceive(new Sim({ seed: 1, game: defaultGame() }), createMemory(defaultPerception()));

export const OFFER_ID = 7;

export function cardsFor(hero: number): CardView[] {
  return [
    {
      bargain: 'unvented-barrel',
      scope: 'hero',
      hero,
      gains: [effect('dealt', 'self', 1.4)],
      costs: [effect('def', 'self', 0, { path: 'heat.decayPerSecond', op: 'mul' })],
    },
    {
      bargain: 'call-the-horde',
      scope: 'team',
      hero: 0,
      gains: [effect('dealt', 'team', 1.2)],
      costs: [effect('waveExtra', 'team', 2, { def: 'runner' }), effect('respawn', 'team', 1.5)],
    },
    {
      bargain: 'blood-tithe',
      scope: 'team',
      hero: 0,
      gains: [effect('ancientHeal', 'team', 0.25)],
      costs: [
        effect('masterBudget', 'team', 3),
        effect('def', 'team', 1.1, { path: 'maxHp', op: 'mul', def: 'grunt' }),
      ],
    },
  ];
}

/** `plain` with one open offer that lapses `secondsLeft` after the perception's tick. */
export function withOffer(secondsLeft = WINDOW_SECONDS): Perception {
  const hero = plain.heroes[0]?.id ?? 1;
  const left = Math.round(secondsLeft * TICK_HZ);
  return {
    ...plain,
    heroes: plain.heroes.map((h, i) => (i === 0 ? { ...h, bargains: ['hair-shirt'] } : h)),
    bargains: {
      open: [{ id: OFFER_ID, wave: 3, expiresAt: plain.tick + left, ticksLeft: left, cards: cardsFor(hero) }],
      taken: [
        {
          bargain: 'hair-shirt',
          offer: 1,
          hero,
          tick: 1,
          gains: [effect('def', 'self', 1.5, { path: 'zeal.maxBonus', op: 'mul' })],
          costs: [effect('healTaken', 'self', 0)],
        },
      ],
    },
  };
}

export const controls: ControlState = {
  selected: 0,
  aim: undefined,
  cursor: undefined,
  arming: {
    armOn: false,
    phase: 'off',
    slot: -1,
    x: 0,
    y: 0,
    fireHalfSeconds: 4,
    intent: 0,
    offsetHalfSeconds: 0,
    lastPost: undefined,
  },
  paused: false,
  help: false,
  hint: undefined,
};

export function hudInput(p: Perception, over: Partial<HudInput> = {}): HudInput {
  return {
    p,
    ui: defaultPresentation(),
    controls,
    driven: [0],
    end: undefined,
    maxOffsetSeconds: 5,
    game: { ...defaultGame(), bargains: bargainsDef },
    ...over,
  };
}
