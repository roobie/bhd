// Presentation content invariants (D-4E4QRJ7N6LIGZDSD): completeness against the shipped content,
// and the fallbacks for an id it has no entry for. No gameplay numbers.

import { describe, expect, it } from 'vitest';
import { defaultPerception } from '../../../src/content/perception.ts';
import {
  abilityPresentation,
  defaultPresentation,
  enemyPresentation,
  fallbackTargeting,
  hashedColor,
  heroPresentation,
  intentKindOf,
  type Presentation,
  resourcePresentation,
  statusPresentation,
} from '../../../src/content/presentation.ts';
import { defaultStatuses } from '../../../src/content/statuses.ts';
import { createMemory } from '../../../src/perception/memory.ts';
import { perceive } from '../../../src/perception/perceive.ts';
import { Sim } from '../../../src/sim/sim.ts';
import { rosterGame } from '../../legacy.ts';

const HEX = /^#[0-9a-f]{6}$/u;
const EMPTY: Presentation = { abilities: [], resources: [], statuses: [], heroes: [], enemies: [] };

describe('shipped presentation covers the shipped content', () => {
  const ui = defaultPresentation();
  const game = rosterGame();
  const p = perceive(new Sim({ seed: 1, game }), createMemory(defaultPerception()));

  it('has an entry for every ability effect and resource perception can report', () => {
    for (const h of p.heroes) {
      for (const a of h.abilities) {
        expect(
          ui.abilities.some((x) => x.effect === a.effect),
          `ability ${a.effect}`,
        ).toBe(true);
      }
      for (const r of h.resources) {
        expect(
          ui.resources.some((x) => x.name === r.name),
          `resource ${r.name}`,
        ).toBe(true);
      }
    }
  });

  it('has an entry for every status, hero and enemy def', () => {
    for (const s of defaultStatuses()) {
      expect(
        ui.statuses.some((x) => x.id === s.id),
        `status ${s.id}`,
      ).toBe(true);
    }
    for (const h of game.heroes) {
      expect(
        ui.heroes.some((x) => x.id === h.id),
        `hero ${h.id}`,
      ).toBe(true);
    }
    for (const e of game.enemies) {
      expect(
        ui.enemies.some((x) => x.id === e.id),
        `enemy ${e.id}`,
      ).toBe(true);
    }
  });

  it('has unique ids and well-formed colours', () => {
    const keys = [
      ui.abilities.map((x) => x.effect),
      ui.resources.map((x) => x.name),
      ui.statuses.map((x) => x.id),
      ui.heroes.map((x) => x.id),
      ui.enemies.map((x) => x.id),
    ];
    for (const k of keys) {
      expect(new Set(k).size).toBe(k.length);
    }
    for (const c of [...ui.resources, ...ui.statuses, ...ui.heroes, ...ui.enemies].map((x) => x.color)) {
      expect(c).toMatch(HEX);
    }
  });
});

describe('fallbacks for an id with no entry', () => {
  it('label is the id and the colour is stable and well formed', () => {
    expect(heroPresentation(EMPTY, 'newbie').label).toBe('newbie');
    expect(enemyPresentation(EMPTY, 'newbie').color).toMatch(HEX);
    expect(resourcePresentation(EMPTY, 'mana').label).toBe('mana');
    expect(statusPresentation(EMPTY, 'burning').label).toBe('burning');
    expect(hashedColor('x')).toBe(hashedColor('x'));
    expect(hashedColor('x')).not.toBe(hashedColor('y'));
  });

  it('targeting follows range and radius', () => {
    expect(fallbackTargeting(5, 3)).toBe('point');
    expect(fallbackTargeting(5, 0)).toBe('unit');
    expect(fallbackTargeting(0, 3)).toBe('instant');
    expect(fallbackTargeting(0, 0)).toBe('instant');
    expect(abilityPresentation(EMPTY, 'zap', { range: 7, radius: 2 }).targeting).toBe('point');
  });

  it('an entry wins over the fallback, and the intent kind defaults to the effect', () => {
    const ui: Presentation = {
      ...EMPTY,
      abilities: [{ effect: 'zap', label: 'Zap', glyph: 'Z', targeting: 'direction', armable: true }],
    };
    const a = abilityPresentation(ui, 'zap', { range: 7, radius: 2 });
    expect(a.targeting).toBe('direction');
    expect(intentKindOf(a)).toBe('zap');
    expect(intentKindOf({ ...a, intentKind: 'pull' })).toBe('pull');
  });
});
