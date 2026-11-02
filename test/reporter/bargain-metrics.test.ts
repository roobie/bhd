// Bargain metrics and the Ancient invariant on synthetic event logs (the specced metric
// definitions of docs/METRICS.md; no tuned numbers or outcomes, D-4E4QRJ7N6LIGZDSD).

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { defaultBotSetup } from '../../src/content/bots.ts';
import { defaultGame } from '../../src/content/index.ts';
import type { ConfigOverrides } from '../../src/content/overrides.ts';
import { applyOverrides } from '../../src/content/overrides.ts';
import type { GameEnd, GameSpec } from '../../src/match/run.ts';
import { RUN_ABI } from '../../src/match/run.ts';
import type { LogHeader } from '../../src/replay/log.ts';
import { ancientViolations } from '../../src/reporter/metrics/bargain.ts';
import { heroDefAt } from '../../src/reporter/metrics/effective.ts';
import { computeMetrics, METRICS } from '../../src/reporter/metrics/registry.ts';
import type { GameLog, MetricDef } from '../../src/reporter/types.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { testBargains } from '../bargains-fixture.ts';

const SPEC: GameSpec = {
  abi: RUN_ABI,
  seed: 1,
  mode: 'director',
  doctrines: ['hold-the-line', 'hold-the-line', 'greedy', 'greedy'],
  reactionSeconds: 0.4,
  thinkSeconds: 0.5,
  maxTicks: 1500,
  hashEvery: 30,
};

const END_TICK = 2000;

function logOf(events: SimEvent[]): GameLog {
  const end: GameEnd = { tick: END_TICK, wave: 3, reason: 'victory' };
  const header: LogHeader = {
    format: 'bhd-log',
    v: 1,
    abi: RUN_ABI,
    side: 'base',
    ref: 'x',
    sha: 'x',
    dirty: false,
    fingerprint: 'x',
    spec: SPEC,
    resolved: { game: { ...defaultGame(), bargains: testBargains() }, bots: defaultBotSetup() },
    end,
    ticks: end.tick,
  };
  return { header, events };
}

function metric(id: string): MetricDef {
  const m = METRICS.find((x) => x.id === id);
  if (m === undefined) {
    throw new Error(`no metric ${id}`);
  }
  return m;
}

// Entity ids: 1 ancient, 2 gunner, 3 penitent.
const SPAWNS: SimEvent[] = [
  { tick: 0, kind: 'spawn', id: 1, def: 'ancient', team: 0 },
  { tick: 0, kind: 'spawn', id: 2, def: 'gunner', team: 0 },
  { tick: 0, kind: 'spawn', id: 3, def: 'penitent', team: 0 },
];

const CARDS = ['test-barrel', 'test-tithe', 'test-horde'];

const OFFERED: SimEvent[] = [
  { tick: 100, kind: 'wave', n: 1, phase: 'start', composition: [] },
  { tick: 200, kind: 'bargain', op: 'offer', offer: 1, wave: 1, cards: CARDS, until: 600 },
  { tick: 300, kind: 'bargain', op: 'accept', offer: 1, card: 'test-tithe', hero: 0 },
  { tick: 300, kind: 'heal', src: 0, dst: 1, amount: 50 },
  { tick: 300, kind: 'bargain', op: 'end', offer: 1 },
  { tick: 700, kind: 'wave', n: 2, phase: 'start', composition: [] },
  { tick: 800, kind: 'bargain', op: 'offer', offer: 2, wave: 2, cards: CARDS, until: 1200 },
  { tick: 1200, kind: 'bargain', op: 'expire', offer: 2 },
  { tick: 1200, kind: 'heal', src: 0, dst: 1, amount: 7 },
  { tick: 1200, kind: 'bargain', op: 'end', offer: 2 },
  { tick: 1300, kind: 'bargain', op: 'offer', offer: 3, wave: 2, cards: CARDS, until: 1700 },
  { tick: 1400, kind: 'bargain', op: 'decline', offer: 3 },
  { tick: 1400, kind: 'heal', src: 0, dst: 1, amount: 7 },
  { tick: 1400, kind: 'bargain', op: 'end', offer: 3 },
  { tick: 1500, kind: 'wave', n: 3, phase: 'start', composition: [] },
];

describe('bargain metrics', () => {
  const log = logOf([...SPAWNS, ...OFFERED]);

  it('accept rate counts only cards that were offered, skips the rest', () => {
    const out = metric('bargain.accept').compute(log);
    expect(out['test-tithe']).toBeCloseTo(1 / 3);
    expect(out['test-barrel']).toBe(0);
    expect(out['test-hair-shirt']).toBeUndefined();
  });

  it('splits declines and expiries and ignores open offers', () => {
    const open = logOf([
      ...SPAWNS,
      { tick: 10, kind: 'bargain', op: 'offer', offer: 1, wave: 1, cards: CARDS, until: 99 },
    ]);
    expect(metric('bargain.decline').compute(open)).toEqual({});
    expect(metric('bargain.decline').compute(log).all).toBeCloseTo(1 / 3);
    expect(metric('bargain.expire').compute(log).all).toBeCloseTo(1 / 3);
  });

  it('an expire that carries a card is a timed bargain ending, not an offer lapsing', () => {
    const timed = logOf([
      ...SPAWNS,
      ...OFFERED,
      { tick: 1600, kind: 'bargain', op: 'expire', offer: 1, card: 'test-tithe', hero: 0 },
    ]);
    expect(metric('bargain.expire').compute(timed)).toEqual(metric('bargain.expire').compute(log));
    expect(metric('bargain.decline').compute(timed)).toEqual(metric('bargain.decline').compute(log));
  });

  it('hero def reads follow accepted bargains and their timed ending', () => {
    const accept = (card: string, hero: number): SimEvent => ({
      tick: 300,
      kind: 'bargain',
      op: 'accept',
      offer: 1,
      card,
      hero,
    });
    const patched = logOf([...SPAWNS, accept('test-hair-shirt', 3)]);
    const base = heroDefAt(logOf(SPAWNS), 3, 'penitent', 400);
    const at = (tick: number) => heroDefAt(patched, 3, 'penitent', tick);
    expect(at(299)).toEqual(base);
    const [now, was] = [at(300), base];
    if (now?.kit !== 'penitent' || was?.kit !== 'penitent') {
      throw new Error('no penitent def');
    }
    expect(now.zeal.maxBonus).toBeGreaterThan(was.zeal.maxBonus);
    expect(heroDefAt(patched, 2, 'gunner', 400)).toEqual(heroDefAt(logOf(SPAWNS), 2, 'gunner', 400));
    const ended = logOf([
      ...SPAWNS,
      accept('test-hair-shirt', 3),
      { tick: 500, kind: 'bargain', op: 'expire', offer: 1, card: 'test-hair-shirt', hero: 3 },
    ]);
    expect(heroDefAt(ended, 3, 'penitent', 600)).toEqual(base);
  });

  it('files Ancient heals by the resolution of the same tick', () => {
    expect(metric('bargain.ancientHealed').compute(log)).toEqual({ decline: 14, accept: 50, other: 0, total: 64 });
  });

  it('estimates wave extras from accepted cards in the config', () => {
    const horde = logOf([
      ...SPAWNS,
      { tick: 1, kind: 'bargain', op: 'offer', offer: 1, wave: 1, cards: CARDS, until: 9 },
      { tick: 2, kind: 'bargain', op: 'accept', offer: 1, card: 'test-horde', hero: 0 },
      { tick: 5, kind: 'wave', n: 2, phase: 'start', composition: [] },
      { tick: 8, kind: 'wave', n: 3, phase: 'start', composition: [] },
    ]);
    expect(metric('bargain.extras').compute(horde)).toEqual({ runner: 4 });
    expect(metric('bargain.extras').compute(log)).toEqual({});
  });

  it('attributes ff and respawn time to accepted bargains, with a none baseline', () => {
    const l = logOf([
      ...SPAWNS,
      { tick: 50, kind: 'dmg', src: 2, dst: 3, amount: 10, tags: ['ff'] },
      { tick: 100, kind: 'death', id: 3, killer: 0 },
      { tick: 140, kind: 'respawn', id: 3 },
      { tick: 200, kind: 'bargain', op: 'offer', offer: 1, wave: 1, cards: CARDS, until: 600 },
      { tick: 300, kind: 'bargain', op: 'accept', offer: 1, card: 'test-tithe', hero: 0 },
      { tick: 400, kind: 'dmg', src: 2, dst: 3, amount: 20, tags: ['ff'] },
      { tick: 500, kind: 'death', id: 3, killer: 0 },
      { tick: 600, kind: 'respawn', id: 3 },
    ]);
    const ff = metric('bargain.ff').compute(l);
    expect(ff.none).toBeCloseTo(10 / 0.3);
    expect(ff['test-tithe']).toBeCloseTo(20 / 1.7);
    expect(metric('bargain.respawn').compute(l)).toEqual({ none: 40, 'test-tithe': 100 });
    expect(metric('bargain.ff').compute(log)).toEqual({ none: 0, 'test-tithe': 0 });
  });

  it('splits the outcome by accepted-at-least-one, and has no keys without offers', () => {
    expect(metric('bargain.any').compute(log)).toEqual({ '': 1 });
    expect(Object.keys(metric('bargain.outcome').compute(log)).sort()).toEqual(['accepted:ancientHp', 'accepted:wave']);
    const none = logOf([...SPAWNS, { tick: 1, kind: 'bargain', op: 'offer', offer: 1, wave: 1, cards: CARDS }]);
    expect(metric('bargain.any').compute(none)).toEqual({ '': 0 });
    expect(Object.keys(metric('bargain.outcome').compute(none))[0]).toBe('declined:wave');
    expect(metric('bargain.outcome').compute(logOf(SPAWNS))).toEqual({});
  });

  it('puts per-bargain series in area bargain.<id> and the rest in bargain', () => {
    const accept = metric('bargain.accept');
    expect(accept.areasOf?.('test-tithe')).toEqual(['bargain.test-tithe']);
    expect(metric('bargain.ff').areasOf?.('none')).toEqual(['bargain']);
  });

  it('computes through the registry without bargain events', () => {
    const values = computeMetrics(logOf(SPAWNS));
    expect(values['bargain.ancientViolations']).toBe(0);
    expect(Object.keys(values).some((k) => k.startsWith('bargain.accept'))).toBe(false);
  });
});

describe('Ancient invariant', () => {
  const leak: SimEvent = { tick: 50, kind: 'dmg', src: 10, dst: 1, amount: 5, tags: ['leak'] };

  it('holds for leak damage, heals and bargain events', () => {
    const log = logOf([...SPAWNS, leak, ...OFFERED]);
    expect(ancientViolations(log)).toEqual([]);
    expect(metric('bargain.ancientViolations').compute(log)).toEqual({ '': 0 });
  });

  it('flags non-leak damage to the Ancient', () => {
    const log = logOf([
      ...SPAWNS,
      leak,
      { tick: 60, kind: 'dmg', src: 2, dst: 1, amount: 3, tags: ['ff'] },
      { tick: 70, kind: 'dmg', src: 2, dst: 1, amount: 3, tags: [] },
    ]);
    expect(ancientViolations(log)).toHaveLength(2);
    expect(metric('bargain.ancientViolations').compute(log)).toEqual({ '': 2 });
  });
});

const POLICY_ERROR = /bargain policy/u;

describe('bargain policy override files', () => {
  const base = { game: defaultGame(), bots: defaultBotSetup() };

  it.each([
    ['declineAll', 'bargains-decline'],
    ['acceptAll', 'bargains-accept'],
  ])('%s applies once the defaults carry the bargain keys', (policy, name) => {
    const overrides = JSON.parse(readFileSync(`scenarios/${name}.json`, 'utf8')) as ConfigOverrides;
    const out = applyOverrides(base, overrides);
    expect(out.bots.bargain?.policy).toBe(policy);
    expect(out.game.bargains).toBeDefined();
  });

  it('rejects an unknown policy', () => {
    expect(() => applyOverrides(base, { bots: { bargain: { policy: 'sometimes' } } })).toThrow(POLICY_ERROR);
  });
});
