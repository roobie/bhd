// run.ts invariants: a spec determines the game, the viewer builds through it, the ABI is checked.
// Nothing here asserts what a bot or the Director chooses, or how a game goes.

import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/client/config.ts';
import { buildMatch as buildViewerMatch, configFromSpec, specFromConfig } from '../../src/client/setup.ts';
import type { GameSpec } from '../../src/match/run.ts';
import { buildMatch, RUN_ABI, runGame } from '../../src/match/run.ts';
import type { SimEvent } from '../../src/sim/events.ts';

const SHORT = 600;

function spec(over: Partial<GameSpec> = {}): GameSpec {
  return { ...specFromConfig({ ...defaultConfig(), seed: 11 }), maxTicks: SHORT, ...over };
}

describe('runGame', () => {
  it.each(['director', 'schedule'] as const)('the same %s spec twice gives identical events', (mode) => {
    const a = runGame(spec({ mode }));
    const b = runGame(spec({ mode }));
    expect(b.events).toEqual(a.events);
    expect(b.end).toEqual(a.end);
    expect(b.ticks).toBe(a.ticks);
  });

  it('stops at maxTicks and says so', () => {
    const r = runGame(spec({ maxTicks: 5 }));
    expect(r.ticks).toBe(5);
    expect(r.end.reason === 'maxTicks' || r.events.some((e) => e.kind === 'end')).toBe(true);
  });

  it('resolves a Director only in director mode', () => {
    expect(runGame(spec({ mode: 'director', maxTicks: 1 })).resolved.director).toBeDefined();
    expect(runGame(spec({ mode: 'schedule', maxTicks: 1 })).resolved.director).toBeUndefined();
  });

  it('applies overrides to the resolved config', () => {
    const r = runGame(spec({ maxTicks: 1, overrides: { bots: { thinkSeconds: 1 } } }));
    expect(r.resolved.bots.thinkSeconds).toBe(1);
  });

  it('rejects a foreign ABI and a malformed spec', () => {
    expect(() => runGame(spec({ abi: RUN_ABI + 1 }))).toThrow(RangeError);
    expect(() => runGame(spec({ doctrines: ['greedy'] }))).toThrow(RangeError);
    expect(() => runGame(spec({ maxTicks: 0 }))).toThrow(RangeError);
  });
});

describe('the viewer and the runner build the same Match', () => {
  it("the viewer's default spec goes through runGame", () => {
    const cfg = defaultConfig();
    const viewer = buildViewerMatch(cfg);
    const events: SimEvent[] = [];
    for (let i = 0; i < SHORT; i++) {
      events.push(...viewer.step());
    }
    const run = runGame({ ...specFromConfig(cfg), maxTicks: SHORT });
    expect(run.events.slice(0, events.length)).toEqual(events);
  });

  it('buildMatch(spec) steps like the viewer', () => {
    const s = spec();
    const m = buildMatch(s);
    expect(m.tick).toBe(0);
    expect(m.step()).toEqual(buildViewerMatch(configFromSpec(s)).step());
  });

  it('spec and viewer config map back and forth', () => {
    const cfg = {
      ...defaultConfig(),
      seed: 99,
      mode: 'schedule' as const,
      doctrines: ['greedy', 'greedy', 'greedy', 'greedy'],
    };
    expect(configFromSpec(specFromConfig(cfg))).toEqual(cfg);
  });
});
