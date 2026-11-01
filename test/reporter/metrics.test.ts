// Metric query correctness on small hand-built logs, plus an invariant run over one real log
// (finite numbers, no throw; no gameplay values are asserted: D-4E4QRJ7N6LIGZDSD).

import { describe, expect, it } from 'vitest';
import { defaultBotSetup } from '../../src/content/bots.ts';
import type { GameConfig } from '../../src/content/index.ts';
import { defaultGame } from '../../src/content/index.ts';
import type { GameEnd, GameSpec } from '../../src/match/run.ts';
import { RUN_ABI, runGame } from '../../src/match/run.ts';
import type { LogHeader } from '../../src/replay/log.ts';
import { computeMetrics, METRICS } from '../../src/reporter/metrics/registry.ts';
import type { GameLog, MetricDef } from '../../src/reporter/types.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { legacyGame } from '../legacy.ts';

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

function logOf(
  events: SimEvent[],
  end: GameEnd = { tick: 1000, wave: 2, reason: 'victory' },
  game: GameConfig = legacyGame(),
): GameLog {
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
    resolved: { game, bots: defaultBotSetup() },
    end,
    ticks: end.tick,
  };
  return { header, events };
}

// Entity ids: 1 ancient (20 hp), 2 gunner (400), 3 tank (900), 10 and 11 grunts.
const SPAWNS: SimEvent[] = [
  { tick: 0, kind: 'spawn', id: 1, def: 'ancient', team: 0 },
  { tick: 0, kind: 'spawn', id: 2, def: 'gunner', team: 0 },
  { tick: 0, kind: 'spawn', id: 3, def: 'tank', team: 0 },
];
const GRUNTS: SimEvent[] = [
  { tick: 50, kind: 'spawn', id: 10, def: 'grunt', team: 1 },
  { tick: 50, kind: 'spawn', id: 11, def: 'grunt', team: 1 },
];

function metric(id: string): MetricDef {
  const m = METRICS.find((x) => x.id === id);
  if (m === undefined) {
    throw new Error(`no metric ${id}`);
  }
  return m;
}

describe('registry', () => {
  it('registers the 13 metrics of docs/METRICS.md (15 defs: ability and intent have two each)', () => {
    const ids = METRICS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of [
      'outcome.wave',
      'outcome.leaks',
      'outcome.ancientHp',
      'hero.deaths',
      'hero.dmgShare',
      'team.ff',
      'gunner.heat.band',
      'ability.casts',
      'combo.rate',
      'intent.fulfil',
      'choice.spread',
      'team.lowestHp',
      'ult.timing',
    ]) {
      expect(ids).toContain(id);
    }
  });
});

describe('gunner.heat.band', () => {
  it('weights bands by alive ticks, up to death or the end', () => {
    const log = logOf(
      [
        ...SPAWNS,
        { tick: 100, kind: 'resource', hero: 2, resource: 'heat', band: 60 },
        { tick: 300, kind: 'resource', hero: 2, resource: 'heat', band: 100 },
        { tick: 400, kind: 'death', id: 2, killer: 0 },
      ],
      { tick: 1000, wave: 1, reason: 'victory' },
    );
    expect(metric('gunner.heat.band').compute(log)).toEqual({ b0: 0.25, b60: 0.5, b85: 0, b100: 0.25 });
  });

  it('runs to the end of the game when the gunner lives', () => {
    const log = logOf([...SPAWNS, { tick: 500, kind: 'resource', hero: 2, resource: 'heat', band: 85 }]);
    expect(metric('gunner.heat.band').compute(log)).toEqual({ b0: 0.5, b60: 0, b85: 0.5, b100: 0 });
  });
});

describe('hp tracker', () => {
  it('clamps damage at the remaining hp, so dmgShare and ff ignore overkill', () => {
    const log = logOf([
      ...SPAWNS,
      ...GRUNTS,
      { tick: 60, kind: 'dmg', src: 2, dst: 10, amount: 100, tags: [] }, // grunt has far less hp
      { tick: 61, kind: 'dmg', src: 2, dst: 10, amount: 100, tags: [] }, // already at 0
      { tick: 62, kind: 'dmg', src: 3, dst: 11, amount: 5, tags: [] },
      { tick: 70, kind: 'dmg', src: 2, dst: 3, amount: 50, tags: ['ff'] },
    ]);
    const grunt = log.header.resolved.game.enemies.find((e) => e.id === 'grunt')?.maxHp ?? 0;
    const share = metric('hero.dmgShare').compute(log);
    expect(share.gunner).toBeCloseTo(grunt / (grunt + 5));
    expect(share.tank).toBeCloseTo(5 / (grunt + 5));
    expect(metric('team.ff').compute(log)).toEqual({ 'gunner>tank': 50 });
  });

  it('applies heals up to max hp and tracks the lowest team fraction per wave', () => {
    const wave = (n: number, tick: number): SimEvent => ({ tick, kind: 'wave', n, phase: 'start', composition: [] });
    const log = logOf([
      ...SPAWNS,
      wave(1, 10),
      { tick: 20, kind: 'dmg', src: 10, dst: 3, amount: 900, tags: [] },
      { tick: 21, kind: 'heal', src: 2, dst: 3, amount: 450 },
      { tick: 22, kind: 'heal', src: 2, dst: 3, amount: 450 }, // 450 hp left to heal; capped
      wave(2, 30),
      { tick: 40, kind: 'dmg', src: 10, dst: 2, amount: 1000, tags: [] }, // clamped to 400
    ]);
    const total = 400 + 900; // only the two spawned heroes count
    const low = metric('team.lowestHp').compute(log);
    expect(low.w1).toBeCloseTo((total - 900) / total);
    expect(low.w2).toBeCloseTo((total - 400) / total);
    expect(low.game).toBeCloseTo((total - 900) / total);
  });

  it('counts deaths per hero def, with zero for heroes that lived', () => {
    const log = logOf([...SPAWNS, { tick: 9, kind: 'death', id: 3, killer: 0 }]);
    expect(metric('hero.deaths').compute(log)).toEqual({ gunner: 0, tank: 1 });
  });
});

describe('outcome', () => {
  it('reports leaks per wave and Ancient hp at wave starts and the end', () => {
    const wave = (n: number, tick: number): SimEvent => ({ tick, kind: 'wave', n, phase: 'start', composition: [] });
    const log = logOf([
      ...SPAWNS,
      ...GRUNTS,
      wave(1, 60),
      { tick: 70, kind: 'dmg', src: 10, dst: 1, amount: 5, tags: ['leak'] },
      { tick: 70, kind: 'leak', id: 10, livesLost: 5 },
      wave(2, 80),
      { tick: 90, kind: 'dmg', src: 11, dst: 1, amount: 100, tags: ['leak'] },
      { tick: 90, kind: 'leak', id: 11, livesLost: 15 },
    ]);
    expect(metric('outcome.leaks').compute(log)).toEqual({ w1: 1, w2: 1 });
    expect(metric('outcome.ancientHp').compute(log)).toEqual({ w1: 1, w2: 0.75, end: 0 });
    expect(metric('outcome.wave').compute(log)).toEqual({ '': 2 });
  });
});

describe('choice.spread', () => {
  it('counts a pick until the next pick, a death or the end', () => {
    const pick = (tick: number, hero: number, picked: string): SimEvent => ({
      tick,
      kind: 'choice',
      hero,
      decision: 'stance',
      options: [
        { id: 'a', score: 1 },
        { id: 'b', score: 0 },
      ],
      picked,
    });
    const log = logOf([
      ...SPAWNS,
      pick(0, 2, 'a'), // gunner: a for 100, b for 100 until it dies at 200
      pick(100, 2, 'b'),
      { tick: 200, kind: 'death', id: 2, killer: 0 },
      pick(0, 3, 'a'), // tank: a for the whole 1000 ticks
    ]);
    const out = metric('choice.spread').compute(log);
    expect(out).toEqual({ 'gunner:stance:a': 0.5, 'gunner:stance:b': 0.5, 'tank:stance:a': 1, 'tank:stance:b': 0 });
  });
});

describe('intents', () => {
  const intent = (tick: number, id: number, op: 'post' | 'fulfil', by: number): SimEvent => ({
    tick,
    kind: 'intent',
    id,
    op,
    by,
    intentKind: 'pull-then-burn',
  });
  const log = logOf([
    ...SPAWNS,
    { tick: 0, kind: 'wave', n: 1, phase: 'start', composition: [] },
    intent(10, 1, 'post', 3),
    intent(30, 2, 'post', 3),
    { tick: 40, kind: 'ability', hero: 2, slot: 2, target: 0, value: 7 },
    intent(50, 1, 'fulfil', 2),
  ]);

  it('measures post to fulfil latency and the fulfil ratio', () => {
    expect(metric('intent.latency').compute(log)).toEqual({ 'pull-then-burn': 40 });
    expect(metric('intent.fulfil').compute(log)).toEqual({ 'pull-then-burn': 0.5 });
  });

  it('uses the fulfilling hero cast value as the combo proxy payoff', () => {
    expect(metric('combo.rate').compute(log)).toEqual({ 'pull-then-burn:w1': 1, 'pull-then-burn:w1:payoff': 7 });
  });
});

describe('abilities and ultimates', () => {
  const log = logOf([
    ...SPAWNS,
    ...GRUNTS,
    { tick: 5, kind: 'wave', n: 1, phase: 'start', composition: [] },
    { tick: 20, kind: 'ability', hero: 2, slot: 1, target: 0, value: 2 },
    { tick: 30, kind: 'ability', hero: 2, slot: 1, target: 0, value: 4 },
    { tick: 60, kind: 'dmg', src: 10, dst: 2, amount: 100, tags: [] },
    { tick: 70, kind: 'ability', hero: 2, slot: 3, target: 0, value: 9 },
  ]);

  it('counts casts and averages value per hero:slot', () => {
    expect(metric('ability.casts').compute(log)).toEqual({ 'gunner:1': 2, 'gunner:3': 1 });
    expect(metric('ability.value').compute(log)).toEqual({ 'gunner:1': 3, 'gunner:3': 9 });
  });

  it('records the first slot-3 cast of the gunner as its ultimate', () => {
    const out = metric('ult.timing').compute(log);
    const total = 400 + 900; // only the two spawned heroes count
    expect(out['gunner:casts']).toBe(1);
    expect(out['gunner:wave']).toBe(1);
    expect(out['gunner:enemies']).toBe(2);
    expect(out['gunner:teamHp']).toBeCloseTo((total - 100) / total);
    expect(out['tank:casts']).toBe(0);
    expect(out['tank:wave']).toBeUndefined();
  });
});

describe('missing semantics', () => {
  it('uses skip for per-wave and per-key means, zero for counts and shares', () => {
    const by = new Map(METRICS.map((m) => [m.id, m.missing]));
    expect(by.get('outcome.leaks')).toBe('skip');
    expect(by.get('intent.latency')).toBe('skip');
    expect(by.get('ability.value')).toBe('skip');
    expect(by.get('hero.deaths')).toBe('zero');
    expect(by.get('choice.spread')).toBe('zero');
    expect(by.get('team.ff')).toBe('zero');
  });
});

describe('every metric is finite', () => {
  const nonFinite = (log: GameLog): string[] =>
    Object.entries(computeMetrics(log))
      .filter(([, v]) => !Number.isFinite(v))
      .map(([name]) => name);

  it('on an empty log', () => {
    expect(nonFinite(logOf([], { tick: 0, wave: 0, reason: 'victory' }))).toEqual([]);
  });

  it('on a synthetic log with zero alive time and no damage', () => {
    expect(nonFinite(logOf([...SPAWNS], { tick: 0, wave: 0, reason: 'victory' }))).toEqual([]);
  });

  it('on one real full runGame log', () => {
    const game = runGame({ ...SPEC, maxTicks: 30_000 });
    // runGame plays the shipping lineup, so the header must resolve to it, not the legacy one.
    const base = logOf(game.events, game.end);
    const log: GameLog = {
      ...base,
      header: { ...base.header, resolved: { game: defaultGame(), bots: defaultBotSetup() } },
    };
    expect(nonFinite(log)).toEqual([]);
    expect(Object.keys(computeMetrics(log)).length).toBeGreaterThan(0);
  });
});
