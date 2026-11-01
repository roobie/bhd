// UI content coverage invariants (wave 8 slice F): every ability and resource the shipped lineup can
// show has presentation, an icon and help that fills completely. No gameplay numbers pinned.

import { describe, expect, it } from 'vitest';
import {
  describeAbility,
  describeCallWave,
  describeFallen,
  describeResource,
  describeStatus,
  resourceTemplates,
} from '../../src/content/help.ts';
import { UI_ICONS } from '../../src/content/icons.ts';
import { defaultGame } from '../../src/content/index.ts';
import { defaultPerception } from '../../src/content/perception.ts';
import { defaultPresentation, respawnText, UI_TEXT } from '../../src/content/presentation.ts';
import { createMemory } from '../../src/perception/memory.ts';
import { perceive } from '../../src/perception/perceive.ts';
import { Sim } from '../../src/sim/sim.ts';

const game = defaultGame();
const ui = defaultPresentation();
const p = perceive(new Sim({ seed: 1, game }), createMemory(defaultPerception()));
const BAD = /NaN|undefined|\?|\{|\}/u;
const PATH = /^M/u;
const facts = { statuses: game.statuses, heroes: game.heroes };

describe('the default lineup', () => {
  it('has presentation, an icon and filled help for every ability it can show', () => {
    expect(p.heroes.length).toBe(4);
    for (const h of p.heroes) {
      const def = game.heroes.find((d) => d.id === h.def);
      for (const a of h.abilities) {
        const pres = ui.abilities.find((x) => x.effect === a.effect);
        expect(pres?.icon, `${h.def}/${a.effect} icon`).toMatch(PATH);
        const d = describeAbility(a.effect, { def, statuses: game.statuses });
        expect(d, `${h.def}/${a.effect} help`).toBeDefined();
        expect(`${d?.text} ${d?.cost}`, `${h.def}/${a.effect}`).not.toMatch(BAD);
      }
    }
  });

  it('has presentation and filled help for every resource it can show', () => {
    for (const h of p.heroes) {
      const def = game.heroes.find((d) => d.id === h.def);
      for (const r of h.resources) {
        expect(
          ui.resources.some((x) => x.name === r.name),
          `${h.def}/${r.name} presentation`,
        ).toBe(true);
        expect(describeResource(r.name, def), `${h.def}/${r.name} help`).not.toMatch(BAD);
      }
    }
    for (const t of resourceTemplates()) {
      expect(
        game.heroes.some((d) => t.unfilled(d).length === 0),
        t.name,
      ).toBe(true);
    }
  });

  it('presents and describes every hero kit state', () => {
    for (const id of ['spent', 'martyrdom', 'discharge']) {
      const s = ui.statuses.find((x) => x.id === id);
      expect(s?.icon, id).toMatch(PATH);
      expect(describeStatus(id, facts), id).not.toMatch(BAD);
    }
  });

  it('names every hero', () => {
    for (const d of game.heroes) {
      const pres = ui.heroes.find((x) => x.id === d.id);
      expect(pres, d.id).toBeDefined();
      expect(pres?.label, d.id).not.toBe(d.id);
    }
  });
});

describe('fallen and call-wave strings', () => {
  it('have icons and text without holes', () => {
    expect(UI_ICONS.callWave).toMatch(PATH);
    expect(UI_ICONS.fallen).toMatch(PATH);
    expect(UI_TEXT.callWave.label.length).toBeGreaterThan(0);
    expect(describeCallWave()).toContain(UI_TEXT.callWave.key);
    expect(describeCallWave()).not.toMatch(BAD);
    expect(describeFallen(game.rules)).not.toMatch(BAD);
    expect(describeFallen({ ...game.rules, wipeLoses: true })).not.toMatch(BAD);
    expect(respawnText(61, 30)).not.toMatch(BAD);
  });

  it('track the rules: a tuned respawn base shows in the help', () => {
    const tuned = { ...game.rules, respawn: { ...game.rules.respawn, base: 77 } };
    expect(describeFallen(tuned)).toContain('77');
  });
});
