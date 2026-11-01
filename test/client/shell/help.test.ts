// Help content invariants (D-4E4QRJ7N6LIGZDSD): every shipped ability and status has an icon and a
// help entry, templates fill completely, and unknown ids degrade. No gameplay numbers pinned.

import { describe, expect, it } from 'vitest';
import {
  abilityTemplates,
  describeAbility,
  describeStatus,
  fillTemplate,
  statusTemplates,
  unfilled,
} from '../../../src/content/help.ts';
import { defaultGame } from '../../../src/content/index.ts';
import { defaultPerception } from '../../../src/content/perception.ts';
import { defaultPresentation } from '../../../src/content/presentation.ts';

import { createMemory } from '../../../src/perception/memory.ts';
import { perceive } from '../../../src/perception/perceive.ts';
import { Sim } from '../../../src/sim/sim.ts';

const game = defaultGame();
const p = perceive(new Sim({ seed: 1, game }), createMemory(defaultPerception()));
const PATH = /^M/u;
const BAD = /NaN|undefined|\?|\{|\}/u;

describe('icons and help cover the shipped content', () => {
  const ui = defaultPresentation();
  const effects = [
    ...new Set(game.heroes.flatMap((h) => (h.kit === 'standin' ? h.abilities.map((a) => a.effect) : []))),
  ];

  it('has an icon for every presented ability and status', () => {
    for (const a of ui.abilities) {
      expect(a.icon, a.effect).toMatch(PATH);
    }
    for (const s of ui.statuses) {
      expect(s.icon, s.id).toMatch(PATH);
    }
  });

  it('has a status help entry for every status in the config', () => {
    for (const s of game.statuses) {
      expect(describeStatus(s.id, game.statuses), s.id).toBeDefined();
    }
  });

  it('has an ability help entry for every presented ability, stand-ins included', () => {
    for (const a of ui.abilities) {
      const def = game.heroes.find((h) =>
        h.kit === 'standin' ? h.abilities.some((x) => x.effect === a.effect) : true,
      );
      expect(describeAbility(a.effect, { def, statuses: game.statuses }), a.effect).toBeDefined();
    }
    expect(effects.length).toBeGreaterThan(0);
  });
});

describe('templates', () => {
  it('fill completely for every ability perception reports, with no NaN or stray brace', () => {
    for (const h of p.heroes) {
      const def = game.heroes.find((d) => d.id === h.def);
      expect(def, h.def).toBeDefined();
      for (const a of h.abilities) {
        const d = describeAbility(a.effect, { def, statuses: game.statuses });
        expect(d?.text, `${h.def}/${a.effect}`).toBeDefined();
        expect(`${d?.text} ${d?.cost}`, `${h.def}/${a.effect}`).not.toMatch(BAD);
      }
    }
  });

  it('every shipped template is complete for at least one hero', () => {
    for (const t of abilityTemplates()) {
      const ok = game.heroes.some((def) => t.unfilled({ def, statuses: game.statuses }).length === 0);
      expect(ok, t.effect).toBe(true);
    }
  });

  it('fill completely from the shipped status defs', () => {
    for (const t of statusTemplates(game.statuses)) {
      expect(t.unfilled, t.id).toEqual([]);
    }
    for (const s of game.statuses) {
      expect(describeStatus(s.id, game.statuses), s.id).not.toMatch(BAD);
    }
  });

  it('fillTemplate fills known keys and marks missing or non-finite ones', () => {
    expect(fillTemplate('a {x} b {y} c {z}', { x: 2.5, y: Number.NaN })).toBe('a 2.5 b ? c ?');
    expect(unfilled('{a} {b}', { a: 1 })).toEqual(['b']);
  });

  it('track the config: a tuned status duration changes the text', () => {
    const tuned = game.statuses.map((s) => (s.id === 'suppressed' ? { ...s, duration: 17 } : s));
    expect(describeStatus('suppressed', tuned)).toContain('17');
  });
});

describe('unknown ids', () => {
  it('have no description', () => {
    expect(describeAbility('nope', { def: undefined, statuses: [] })).toBeUndefined();
    expect(describeStatus('nope', [])).toBeUndefined();
  });

  it('show ? rather than inventing numbers when the def is missing', () => {
    const d = describeAbility('heal', { def: undefined, statuses: [] });
    expect(d?.text).toContain('?');
  });
});
