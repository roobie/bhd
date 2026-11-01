// Match.setDriven: handing heroes between a human and the bots (invariants of the handover, not of play).

import { describe, expect, it } from 'vitest';
import type { Bot, BrainTable } from '../../src/bots/types.ts';
import { defaultBotSetup } from '../../src/content/bots.ts';
import { defaultGame } from '../../src/content/index.ts';
import { Match, type MatchOptions } from '../../src/match/match.ts';
import type { SimEvent } from '../../src/sim/events.ts';

const SEED = 0x13_57_9b_df;
const ALL = 0b1111;

function options(over: Partial<MatchOptions> = {}): MatchOptions {
  return { seed: SEED, game: defaultGame(), bots: defaultBotSetup(), ...over };
}

function stepTo(m: Match, tick: number): SimEvent[] {
  const out: SimEvent[] = [];
  while (m.tick < tick && !m.ended) {
    out.push(...m.step());
  }
  return out;
}

function heroOf(m: Match, slot: number): number {
  return m.perception.heroes.find((h) => h.slot === slot)?.id ?? -1;
}

function autocastOf(m: Match, slot: number): number {
  return m.sim.entities.get(heroOf(m, slot))?.kit?.autocast ?? -1;
}

/** `cmd` events of one player's non-autocast commands. */
function played(events: readonly SimEvent[], player: number): SimEvent[] {
  return events.filter((e) => e.kind === 'cmd' && e.player === player && e.cmd.kind !== 'autocast');
}

/** A bot that posts a different move every think, so every think shows up as a command. */
function mover(): Bot {
  return {
    think: (ctx) => [
      {
        id: 'x.move',
        options: [{ id: 'go', value: 1, cost: 0, commands: [{ kind: 'move', hero: ctx.me.id, x: ctx.tick, y: 5 }] }],
      },
    ],
  };
}
const movers: BrainTable = { gunner: mover, penitent: mover, psyker: mover, standin: mover };

describe('Match.setDriven', () => {
  it('a driven seat issues no bot commands, and a seat handed back resumes', () => {
    const m = new Match(options({ driven: [0], brains: movers }));
    expect(m.driven).toEqual([0]);
    expect(m.seats.map((s) => s.slot)).toEqual([1, 2, 3]);
    const quiet = stepTo(m, 600);
    expect(played(quiet, 0)).toEqual([]);
    expect(played(quiet, 1).length + played(quiet, 2).length + played(quiet, 3).length).toBeGreaterThan(0);
    m.setDriven([]);
    expect(m.driven).toEqual([]);
    expect(m.seats.map((s) => s.slot)).toEqual([0, 1, 2, 3]);
    expect(played(stepTo(m, 1500), 0).length).toBeGreaterThan(0);
  });

  it('switching heroes hands control back and forth: only the driven seat goes quiet', () => {
    const m = new Match(options({ driven: [0], brains: movers }));
    stepTo(m, 300);
    expect(played(stepTo(m, 400), 2).length).toBeGreaterThan(0);
    m.setDriven([2]);
    const mark = m.tick;
    const events = stepTo(m, mark + 900);
    // Commands already queued when the bot let go may still apply; give them their reaction delay.
    const later = events.filter((e) => e.tick > mark + 30);
    expect(played(later, 2)).toEqual([]);
    expect(m.seats.map((s) => s.slot)).toEqual([0, 1, 3]);
  });

  it('puts every autocast bit on for bot-driven heroes and off for the human, through commands', () => {
    const m = new Match(options({ driven: [1] }));
    stepTo(m, 2);
    expect(autocastOf(m, 0)).toBe(ALL);
    expect(autocastOf(m, 1)).toBe(0);
    m.setDriven([0]);
    stepTo(m, m.tick + 2);
    expect(autocastOf(m, 0)).toBe(0);
    expect(autocastOf(m, 1)).toBe(ALL);
  });

  it('clears a hold on each handover so no order is left stuck', () => {
    const m = new Match(options({ driven: [0] }));
    const hero = heroOf(m, 0);
    m.sim.command(0, { kind: 'hold', hero, on: true }, m.tick + 1);
    stepTo(m, 2);
    expect(m.sim.entities.get(hero)?.kit?.hold).toBe(true);
    m.setDriven([1]);
    stepTo(m, m.tick + 2);
    expect(m.sim.entities.get(hero)?.kit?.hold).toBe(false);
  });

  it('a handover to a downed hero waits for its respawn', () => {
    const m = new Match(options({ driven: [1] }));
    stepTo(m, 2);
    const hero = m.sim.entities.get(heroOf(m, 0));
    expect(hero?.kit).toBeDefined();
    if (hero?.kit === undefined) {
      return;
    }
    expect(hero.kit.autocast).toBe(ALL);
    hero.hp = 0;
    m.setDriven([0, 1]);
    stepTo(m, m.tick + 3);
    expect(hero.kit.autocast).toBe(ALL);
    hero.hp = 1;
    stepTo(m, m.tick + 3);
    expect(hero.kit.autocast).toBe(0);
  });

  it('rejects slots outside 0-3 and duplicates, changing nothing', () => {
    const m = new Match(options({ driven: [0] }));
    expect(() => m.setDriven([4])).toThrow(RangeError);
    expect(() => m.setDriven([1, 1])).toThrow(RangeError);
    expect(m.driven).toEqual([0]);
  });

  it('is deterministic: the same handover schedule gives the same events and state', () => {
    const play = (): { events: string; hash: string } => {
      const m = new Match(options({ driven: [0] }));
      const events = [...stepTo(m, 300)];
      m.setDriven([3]);
      events.push(...stepTo(m, 700));
      m.setDriven([]);
      events.push(...stepTo(m, 1000));
      return { events: JSON.stringify(events), hash: m.sim.hash() };
    };
    expect(play()).toEqual(play());
  });
});

describe('the autocast mask filter', () => {
  function caster(): Bot {
    return {
      think: (ctx) => [
        {
          id: 'x.cast',
          options: [
            {
              id: 'go',
              value: 1,
              cost: 0,
              commands: [0, 1, 2, 3].map((slot) => ({ kind: 'ability' as const, hero: ctx.me.id, slot })),
            },
          ],
        },
      ],
    };
  }
  const brains: BrainTable = { gunner: caster, penitent: caster, psyker: caster, standin: caster };

  function abilitySlots(events: readonly SimEvent[], after: number): Set<number> {
    const slots = new Set<number>();
    for (const e of events) {
      if (e.kind === 'cmd' && e.player === 0 && e.cmd.kind === 'ability' && e.tick > after) {
        slots.add(e.cmd.slot);
      }
    }
    return slots;
  }

  it('lets a bot cast only the abilities whose autocast bit is on', () => {
    const m = new Match(options({ brains }));
    stepTo(m, 60);
    expect(abilitySlots(stepTo(m, 120), 60)).toEqual(new Set([0, 1, 2, 3]));
    const hero = heroOf(m, 0);
    m.sim.command(0, { kind: 'autocast', hero, slot: 1, on: false }, m.tick + 1);
    m.sim.command(0, { kind: 'autocast', hero, slot: 3, on: false }, m.tick + 1);
    stepTo(m, m.tick + 40);
    const from = m.tick;
    expect(abilitySlots(stepTo(m, from + 90), from)).toEqual(new Set([0, 2]));
  });
});
