// Bargain evaluator invariants (wave 9 slice C, D-4E4QRJ7N6LIGZDSD): determinism, option and command
// shapes, the three policies, owner seat, and the match round's command path. Nothing here asserts
// which card a tuned evaluator picks in a given situation, only that the evaluator is not constant.

import { describe, expect, it } from 'vitest';
import { bargainDecisions } from '../../src/bots/bargain.ts';
import type { BotCtx, Decision } from '../../src/bots/types.ts';
import { decide } from '../../src/bots/utility.ts';
import { defaultBotSetup } from '../../src/content/bots.ts';
import { defaultGame } from '../../src/content/index.ts';
import { createRng } from '../../src/detmath/index.ts';
import { Match, type MatchOptions } from '../../src/match/match.ts';
import type { CardView, EffectView, OfferView, Perception } from '../../src/perception/types.ts';
import { canonicalCommand, isValidCommand } from '../../src/sim/commands.ts';
import { testBargains } from '../bargains-fixture.ts';

const SEED = 0x91_b4_c0_de;

function eff(over: Partial<EffectView> & Pick<EffectView, 'kind'>): EffectView {
  return { target: 'self', value: 1, path: '', op: '', def: '', ...over };
}

function card(bargain: string, hero: number, gains: EffectView[], costs: EffectView[]): CardView {
  return { bargain, scope: hero === 0 ? 'team' : 'hero', hero, gains, costs };
}

/** A real Perception of a fresh match, the base every fixture situation overrides. */
function base(): Perception {
  const m = new Match({ seed: SEED, game: defaultGame(), bots: defaultBotSetup() });
  return m.perception;
}

function cards(heroA: number, heroB: number): CardView[] {
  return [
    card(
      'c-dmg',
      heroA,
      [eff({ kind: 'dealt', value: 1.4 })],
      [eff({ kind: 'def', path: 'heat.decayPerSecond', op: 'mul', value: 0 })],
    ),
    card(
      'c-heal',
      0,
      [eff({ kind: 'ancientHeal', target: 'team', value: 0.25 })],
      [eff({ kind: 'respawn', target: 'team', value: 1.5 })],
    ),
    card(
      'c-horde',
      heroB,
      [eff({ kind: 'dealt', target: 'team', value: 1.2 })],
      [
        eff({ kind: 'waveExtra', target: 'team', def: 'runner', value: 2 }),
        eff({ kind: 'def', path: 'rounds.pierce', op: 'mul', value: 0 }),
      ],
    ),
  ];
}

function offerOf(id: number, cs: CardView[]): OfferView {
  return { id, wave: 3, expiresAt: 900, ticksLeft: 400, cards: cs };
}

function withOffers(p: Perception, offers: OfferView[]): Perception {
  return { ...p, bargains: { open: offers, taken: [] } };
}

function ctxOf(p: Perception, meIndex = 0, over: Partial<BotCtx> = {}): BotCtx {
  const setup = defaultBotSetup();
  const [doctrine] = setup.doctrines;
  const me = p.heroes.at(meIndex);
  if (doctrine === undefined || me === undefined) {
    throw new Error('fixture: no doctrine or hero');
  }
  return { p, me, doctrine, weights: setup.kitWeights, delay: 8, tick: p.tick, inFlight: [], ...over };
}

function only(ds: Decision[]): Decision {
  const [d] = ds;
  if (d === undefined) {
    throw new Error('expected a decision');
  }
  return d;
}

function picked(d: Decision): string {
  const rng = createRng(1);
  return decide(d, { stickiness: 0, noise: 0 }, rng, undefined).option.id;
}

/** A spread of situations: Ancient health, fallen heroes, armoured preview, leaks, line allies, risk. */
function situations(): Perception[] {
  const p0 = base();
  const out: Perception[] = [];
  for (const hpFrac of [1, 0.6, 0.15]) {
    for (const weak of [0, 2]) {
      for (const armour of [0, 5]) {
        for (const leaks of [0, 6]) {
          out.push({
            ...p0,
            ancient: { ...p0.ancient, hpFrac },
            fallen: p0.heroes
              .slice(0, weak)
              .map((h) => ({ id: h.id, slot: h.slot, def: h.def, respawnTicks: 100, hpFrac: 0, maxHp: h.maxHp })),
            team: { ...p0.team, lowHeroes: weak, leaks },
            wave: { ...p0.wave, preview: [{ def: 'grunt', count: 8, armour }] },
          });
        }
      }
    }
  }
  return out;
}

function offerFor(p: Perception): OfferView {
  const [a, b] = p.heroes;
  return offerOf(7, cards(a?.id ?? 1, b?.id ?? 2));
}

describe('bargainDecisions: shape', () => {
  it('is empty without an open offer, one decision with one (the Match picks which seat asks)', () => {
    const p = base();
    expect(bargainDecisions(ctxOf(p), 'evaluate')).toEqual([]);
    const open = withOffers(p, [offerFor(p)]);
    expect(bargainDecisions(ctxOf(open, 1), 'evaluate')).toHaveLength(1);
    expect(bargainDecisions(ctxOf(open, 0), 'evaluate')).toHaveLength(1);
  });

  it('offers decline then accept:<card> labelled by bargain id, with valid canonical commands', () => {
    const p = withOffers(base(), [offerFor(base())]);
    const d = only(bargainDecisions(ctxOf(p), 'evaluate'));
    const [offer] = p.bargains.open;
    expect(d.id).toBe('bargain.offer');
    expect(d.options.map((o) => o.id)).toEqual(['decline', ...(offer?.cards ?? []).map((c) => `accept:${c.bargain}`)]);
    expect(d.options.map((o) => o.label ?? o.id)).toEqual(['decline', ...(offer?.cards ?? []).map((c) => c.bargain)]);
    for (const o of d.options) {
      expect(o.commands).toHaveLength(1);
      for (const c of o.commands) {
        expect(isValidCommand(c)).toBe(true);
        expect(canonicalCommand(c)).toEqual(c);
        expect(c.kind === 'bargain' && c.offer).toBe(7);
      }
      expect(Number.isFinite(o.value - o.cost)).toBe(true);
    }
  });

  it('resolves the lowest open offer id first', () => {
    const p0 = base();
    const p = withOffers(p0, [
      { ...offerFor(p0), id: 9 },
      { ...offerFor(p0), id: 4 },
    ]);
    const d = only(bargainDecisions(ctxOf(p), 'evaluate'));
    expect(d.options[0]?.commands).toEqual([{ kind: 'bargain', op: 'decline', offer: 4 }]);
  });

  it('names the benefiting hero of the best card, else the first living hero', () => {
    const p0 = base();
    const owner = p0.heroes[0]?.id ?? 0;
    const hero = p0.heroes[1]?.id ?? 0;
    const forced = (cs: CardView[]): Decision =>
      only(
        bargainDecisions(
          ctxOf(withOffers(p0, [offerOf(1, cs)]), 0, {
            weights: { ...defaultBotSetup().kitWeights, 'bargain.decline.base': -1e6 },
          }),
          'evaluate',
        ),
      );
    const heroCard = card('only', hero, [eff({ kind: 'dealt', value: 3 })], []);
    expect(forced([heroCard]).hero).toBe(hero);
    const teamCard = card('team', 0, [eff({ kind: 'dealt', value: 3 })], []);
    expect(forced([teamCard]).hero).toBe(owner);
    const declined = only(bargainDecisions(ctxOf(withOffers(p0, [offerOf(1, [heroCard])])), 'declineAll'));
    expect(declined.hero).toBe(owner);
  });
});

describe('bargainDecisions: evaluate', () => {
  it('is deterministic for a fixed Perception', () => {
    for (const p of situations()) {
      const open = withOffers(p, [offerFor(p)]);
      const a = bargainDecisions(ctxOf(open), 'evaluate');
      const b = bargainDecisions(ctxOf(structuredClone(open)), 'evaluate');
      expect(b).toEqual(a);
    }
  });

  it('does not mutate its Perception', () => {
    const p = withOffers(base(), [offerFor(base())]);
    const before = JSON.stringify(p);
    bargainDecisions(ctxOf(p), 'evaluate');
    expect(JSON.stringify(p)).toBe(before);
  });

  it('sometimes declines and sometimes accepts over a range of situations', () => {
    const picks = new Set<string>();
    for (const p of situations()) {
      for (const c of offerFor(p).cards) {
        const solo = withOffers(p, [offerOf(1, [c])]);
        picks.add(picked(only(bargainDecisions(ctxOf(solo), 'evaluate'))) === 'decline' ? 'decline' : 'accept');
      }
    }
    expect([...picks].sort()).toEqual(['accept', 'decline']);
  });

  it('values what is missing: a hurt Ancient never makes a heal card worse, a full one gains nothing from it', () => {
    const p0 = base();
    const heal = card('h', 0, [eff({ kind: 'ancientHeal', target: 'team', value: 0.25 })], []);
    const score = (hpFrac: number): number => {
      const p = withOffers({ ...p0, ancient: { ...p0.ancient, hpFrac } }, [offerOf(1, [heal])]);
      const [, o] = only(bargainDecisions(ctxOf(p), 'evaluate')).options;
      return (o?.value ?? 0) - (o?.cost ?? 0);
    };
    expect(score(0.2)).toBeGreaterThanOrEqual(score(0.9));
    expect(score(1)).toBe(0);
  });

  it('weighs a cost more as its situation worsens, and a more risky doctrine less', () => {
    const p0 = base();
    const costs: EffectView[][] = [
      [eff({ kind: 'respawn', target: 'team', value: 1.5 })],
      [eff({ kind: 'waveExtra', target: 'team', def: 'runner', value: 2 })],
      [eff({ kind: 'def', path: 'rounds.pierce', op: 'mul', value: 0 })],
    ];
    const calm: Perception = {
      ...p0,
      fallen: [],
      team: { ...p0.team, lowHeroes: 0, leaks: 0 },
      wave: { ...p0.wave, preview: [{ def: 'g', count: 5, armour: 0 }] },
    };
    const costOf = (p: Perception, c: EffectView[], risk = 0.3): number => {
      const open = withOffers(p, [offerOf(1, [card('x', 0, [], c)])]);
      const at = ctxOf(open);
      const ctx = { ...at, doctrine: { ...at.doctrine, risk } };
      return only(bargainDecisions(ctx, 'evaluate')).options[1]?.cost ?? Number.NaN;
    };
    const worse: Perception[] = [
      {
        ...p0,
        fallen: p0.heroes
          .slice(0, 2)
          .map((h) => ({ id: h.id, slot: h.slot, def: h.def, respawnTicks: 1, hpFrac: 0, maxHp: h.maxHp })),
      },
      { ...calm, team: { ...calm.team, leaks: 5 } },
      { ...calm, wave: { ...calm.wave, preview: [{ def: 'g', count: 5, armour: 4 }] } },
    ];
    costs.forEach((c, i) => {
      const w = worse[i];
      expect(costOf(w ?? calm, c)).toBeGreaterThan(costOf(calm, c));
      expect(costOf(calm, c, 0.9)).toBeLessThan(costOf(calm, c, 0.1));
    });
  });
});

describe('bargainDecisions: policies', () => {
  it('declineAll always declines and acceptAll always takes the first card', () => {
    for (const p of situations()) {
      const open = withOffers(p, [offerFor(p)]);
      expect(picked(only(bargainDecisions(ctxOf(open), 'declineAll')))).toBe('decline');
      const first = offerFor(p).cards[0]?.bargain;
      expect(picked(only(bargainDecisions(ctxOf(open), 'acceptAll')))).toBe(`accept:${first}`);
    }
  });

  it('keep two-plus options so the choice is logged', () => {
    const p = withOffers(base(), [offerFor(base())]);
    for (const policy of ['declineAll', 'acceptAll'] as const) {
      expect(only(bargainDecisions(ctxOf(p), policy)).options.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('Match bargain round', () => {
  function run(policy: MatchOptions['bargainPolicy']): { events: ReturnType<Match['step']>; decisionIds: string[] } {
    const m = new Match({
      seed: SEED,
      game: { ...defaultGame(), bargains: testBargains() },
      bots: defaultBotSetup(),
      ...(policy === undefined ? {} : { bargainPolicy: policy }),
    });
    const events: ReturnType<Match['step']> = [];
    const decisionIds: string[] = [];
    while (!m.ended && m.tick < 1800) {
      events.push(...m.step());
      for (const s of m.seats) {
        decisionIds.push(...s.decisions.map((d) => d.id));
      }
    }
    return { events, decisionIds };
  }

  function resolvers(m: Match, until: number): Set<number> {
    const players = new Set<number>();
    while (!m.ended && m.tick < until) {
      for (const e of m.step()) {
        if (e.kind === 'cmd' && e.cmd.kind === 'bargain') {
          players.add(e.player);
        }
      }
    }
    return players;
  }

  function solo(over: Partial<MatchOptions>): Match {
    return new Match({
      seed: SEED,
      game: { ...defaultGame(), bargains: testBargains() },
      bots: defaultBotSetup(),
      ...over,
    });
  }

  it('a driven seat never decides: the lowest bot seat does', () => {
    const players = resolvers(solo({ driven: [0], bargainPolicy: 'bots' }), 1800);
    expect(players.size).toBeGreaterThan(0);
    expect([...players]).toEqual([1]);
  });

  it('setBargainPolicy hands offers to the bots only from then on, and is deterministic', () => {
    const play = (): string => {
      const m = solo({ driven: [0], bargainPolicy: 'human' });
      const log: unknown[] = [];
      while (!m.ended && m.tick < 1800) {
        if (m.tick === 300) {
          m.setBargainPolicy('bots');
        }
        for (const e of m.step()) {
          log.push(e);
        }
      }
      return JSON.stringify(log);
    };
    expect(play()).toBe(play());
    const m = solo({ driven: [0], bargainPolicy: 'human' });
    expect(resolvers(m, 400)).toEqual(new Set());
    m.setBargainPolicy('bots');
    expect(m.bargainPolicy).toBe('bots');
  });

  it('human and off never put bargain decisions or commands through the bots', () => {
    for (const policy of ['human', 'off'] as const) {
      const { events, decisionIds } = run(policy);
      expect(decisionIds).not.toContain('bargain.offer');
      expect(events.some((e) => e.kind === 'cmd' && e.cmd.kind === 'bargain')).toBe(false);
    }
  });

  it('with bots, bargain commands reach the sim only as logged cmd events from a seat player', () => {
    const { events } = run('bots');
    const cmds = events.flatMap((e) => (e.kind === 'cmd' && e.cmd.kind === 'bargain' ? [e] : []));
    for (const e of cmds) {
      expect(isValidCommand(e.cmd)).toBe(true);
      expect(e.player).toBeGreaterThanOrEqual(0);
      expect(e.player).toBeLessThan(4);
    }
    // Every bargain choice event is about a bargain.offer decision.
    const choices = events.flatMap((e) => (e.kind === 'choice' && e.decision.startsWith('bargain.') ? [e] : []));
    expect(choices.filter((e) => e.decision !== 'bargain.offer')).toEqual([]);
    expect(choices.filter((e) => !e.options.some((o) => o.id === 'decline'))).toEqual([]);
    expect(choices.filter((e) => !e.options.some((o) => o.id === e.picked))).toEqual([]);
  });
});
