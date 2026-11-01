// buildHudModel / hudInsets invariants (D-4E4QRJ7N6LIGZDSD): structure, ranges and fallbacks only.

import { describe, expect, it } from 'vitest';
import { buildHudModel, hudInsets } from '../../../src/client/shell/hudmodel.ts';
import type { ControlState, HudInput } from '../../../src/client/shell/types.ts';
import { defaultGame } from '../../../src/content/index.ts';
import { defaultPerception } from '../../../src/content/perception.ts';
import { defaultPresentation } from '../../../src/content/presentation.ts';
import { createMemory } from '../../../src/perception/memory.ts';
import { perceive } from '../../../src/perception/perceive.ts';
import type { HeroView, Perception } from '../../../src/perception/types.ts';
import { Sim } from '../../../src/sim/sim.ts';

const HEX = /^#[0-9a-f]{6}$/u;
const base: Perception = perceive(new Sim({ seed: 1, game: defaultGame() }), createMemory(defaultPerception()));

const controls: ControlState = {
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
  hint: undefined,
};

function input(over: Partial<HudInput> = {}): HudInput {
  return { p: base, ui: defaultPresentation(), controls, driven: [0], end: undefined, maxOffsetSeconds: 5, ...over };
}

function withHero(slot: number, patch: Partial<HeroView>): Perception {
  return { ...base, heroes: base.heroes.map((h) => (h.slot === slot ? { ...h, ...patch } : h)) };
}

const unit = (v: number): boolean => v >= 0 && v <= 1;

describe('buildHudModel', () => {
  it('has one card per hero slot and one button per ability', () => {
    const m = buildHudModel(input());
    expect(m.heroes.map((c) => c.slot)).toEqual([0, 1, 2, 3]);
    expect(m.bar?.buttons.length).toBe(base.heroes[0]?.abilities.length);
    for (const c of m.heroes) {
      expect(unit(c.hpFrac)).toBe(true);
    }
  });

  it('keeps every fraction in [0, 1] even for out-of-range input', () => {
    const hero = base.heroes[0] as HeroView;
    const p = withHero(0, {
      hpFrac: 1.7,
      resources: [{ name: 'heat', frac: -0.2, band: 0, marks: [0.6, 1.4] }],
      abilities: hero.abilities.map((a) => ({ ...a, cooldownLeft: 999, cooldownTicks: 10 })),
    });
    const m = buildHudModel(input({ p: { ...p, ancient: { ...p.ancient, hpFrac: 2 } } }));
    expect(unit(m.top.ancientFrac)).toBe(true);
    expect(unit(m.heroes[0]?.hpFrac ?? -1)).toBe(true);
    for (const r of m.heroes[0]?.resources ?? []) {
      expect(unit(r.frac)).toBe(true);
      expect(r.marks.every(unit)).toBe(true);
    }
    for (const b of m.bar?.buttons ?? []) {
      expect(unit(b.cooldownFrac)).toBe(true);
    }
  });

  it('cooldown fraction is 0 without a cooldown and the left/total ratio otherwise', () => {
    const hero = base.heroes[0] as HeroView;
    const abilities = hero.abilities.map((a, i) =>
      i === 0 ? { ...a, cooldownLeft: 5, cooldownTicks: 20 } : { ...a, cooldownLeft: 0, cooldownTicks: 0 },
    );
    const m = buildHudModel(input({ p: withHero(0, { abilities }) }));
    expect(m.bar?.buttons[0]?.cooldownFrac).toBeCloseTo(0.25);
    expect(m.bar?.buttons[1]?.cooldownFrac).toBe(0);
  });

  it('falls back for unknown abilities, resources, statuses and defs', () => {
    const p = withHero(0, {
      def: 'newbie',
      abilities: [{ slot: 0, effect: 'zap', ready: true, cooldownLeft: 0, cooldownTicks: 0, range: 5, radius: 2 }],
      resources: [{ name: 'mana', frac: 0.5, band: 0, marks: [] }],
      statuses: [{ status: 'glitter', until: base.tick + 30, src: 0, value: 0 }],
    });
    const m = buildHudModel(input({ p }));
    expect(m.heroes[0]?.label).toBe('newbie');
    expect(m.bar?.buttons[0]?.label).toBe('zap');
    expect(m.bar?.buttons[0]?.targeting).toBe('point');
    expect(m.heroes[0]?.resources[0]?.label).toBe('mana');
    expect(m.heroes[0]?.resources[0]?.color).toMatch(HEX);
    expect(m.heroes[0]?.statuses[0]?.label).toBe('glitter');
    expect(m.heroes[0]?.statuses[0]?.secondsLeft).toBeGreaterThan(0);
    expect(unit(m.heroes[0]?.statuses[0]?.frac ?? -1)).toBe(true);
  });

  it('marks human-driven heroes as you and the others as bot', () => {
    const m = buildHudModel(input({ driven: [1, 3] }));
    expect(m.heroes.map((c) => c.badge)).toEqual(['bot', 'you', 'bot', 'you']);
    expect(buildHudModel(input({ driven: [] })).heroes.every((c) => c.badge === 'bot')).toBe(true);
  });

  it('enables the bar only for a driven hero and flags the selected card', () => {
    expect(buildHudModel(input({ driven: [0] })).bar?.enabled).toBe(true);
    const watch = buildHudModel(input({ driven: [] }));
    expect(watch.bar?.enabled).toBe(false);
    expect(watch.bar?.buttons.every((b) => !b.enabled)).toBe(true);
    expect(watch.heroes.filter((c) => c.selected).map((c) => c.slot)).toEqual([0]);
  });

  it('shows a dead hero as a dead card and has no bar when it is selected', () => {
    const p: Perception = { ...base, heroes: base.heroes.filter((h) => h.slot !== 0) };
    const m = buildHudModel(input({ p }));
    expect(m.heroes[0]?.dead).toBe(true);
    expect(m.heroes).toHaveLength(4);
    expect(m.bar).toBeUndefined();
  });

  it('reports the end result and active hints only', () => {
    expect(buildHudModel(input()).end).toBeUndefined();
    expect(buildHudModel(input({ end: { reason: 'victory', wave: 3 } })).end).toEqual({ result: 'win', wave: 3 });
    expect(buildHudModel(input({ end: { reason: 'ancient-destroyed', wave: 2 } })).end?.result).toBe('loss');
    expect(buildHudModel(input({ end: { reason: 'maxTicks', wave: 2 } })).end?.result).toBe('time');
    const live = { text: 'hello', untilTick: base.tick + 5 };
    expect(buildHudModel(input({ controls: { ...controls, hint: live } })).hint).toBe('hello');
    const gone = { text: 'old', untilTick: base.tick };
    expect(buildHudModel(input({ controls: { ...controls, hint: gone } })).hint).toBeUndefined();
  });

  it('builds hotkeys from the ability slot and bounds the reserve picker by the content maximum', () => {
    const hero = base.heroes[0] as HeroView;
    const gap = withHero(0, { abilities: hero.abilities.slice(1) });
    const keys = buildHudModel(input({ p: gap })).bar?.buttons.map((b) => [b.slot, b.hotkey]);
    for (const [slot, key] of keys ?? []) {
      expect(key).toBe('QWERTY'[slot as number]);
    }
    const arming = { ...controls.arming, phase: 'reserve' as const };
    const m = buildHudModel(input({ controls: { ...controls, arming }, maxOffsetSeconds: 3 }));
    expect(m.picker?.maxSeconds).toBe(3);
  });

  it('shows the fire-time picker while arming a time', () => {
    const arming = { ...controls.arming, phase: 'time' as const, slot: 1 };
    const m = buildHudModel(input({ controls: { ...controls, arming } }));
    expect(m.picker?.mode).toBe('fire');
    expect(m.picker?.seconds).toBeGreaterThanOrEqual(m.picker?.minSeconds ?? 0);
    expect(m.picker?.seconds).toBeLessThanOrEqual(m.picker?.maxSeconds ?? 0);
    expect(buildHudModel(input()).picker).toBeUndefined();
  });
});

describe('hudInsets', () => {
  const safe = { top: 10, right: 0, bottom: 20, left: 0 };

  it('reserves a bottom band in portrait and a left column in landscape, on top of the safe insets', () => {
    const p = hudInsets({ width: 390, height: 844 }, safe);
    const l = hudInsets({ width: 1280, height: 720 }, safe);
    expect(p.top).toBeGreaterThan(safe.top);
    expect(p.bottom).toBeGreaterThan(l.bottom);
    expect(p.left).toBe(0);
    expect(l.left).toBeGreaterThan(0);
  });

  it('leaves a usable free area at both reference sizes', () => {
    for (const v of [
      { width: 390, height: 844 },
      { width: 1280, height: 720 },
    ]) {
      const i = hudInsets(v, safe);
      expect(v.width - i.left - i.right).toBeGreaterThan(v.width / 2);
      expect(v.height - i.top - i.bottom).toBeGreaterThan(v.height / 2);
    }
  });
});
