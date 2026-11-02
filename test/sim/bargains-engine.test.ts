// Engine spec of the bargain sim (wave 9 step 2, slice A): offers, commands, expiry, effects, and
// the invariants that must hold on every seeded run. Specced behaviour and invariants only; no tuned
// numbers (D-4E4QRJ7N6LIGZDSD).

import { describe, expect, it } from 'vitest';
import type { BargainsDef } from '../../src/content/bargains.ts';
import type { GameConfig } from '../../src/content/index.ts';
import { defaultGame, defaultMasterGame } from '../../src/content/index.ts';
import { perceiveBargains } from '../../src/perception/bargains.ts';
import { createMods, heroDef } from '../../src/sim/bargains.ts';
import type { Command } from '../../src/sim/commands.ts';
import type { SimEvent } from '../../src/sim/events.ts';
import { Sim } from '../../src/sim/sim.ts';
import { testBargains } from '../bargains-fixture.ts';
import { runBargainSim, SEED, TICKS } from '../determinism/scenario.ts';

const ANCIENT = 1;

/** A short lane and a tough Ancient, three small waves, so waves end quickly and the game does not. */
function quickGame(over: Partial<BargainsDef> = {}, base: GameConfig = defaultGame()): GameConfig {
  return {
    ...base,
    map: { ...base.map, lane: base.map.lane.slice(-3), ancient: { ...base.map.ancient, maxHp: 400 } },
    waves: {
      firstDelay: 2,
      interval: 8,
      waves: [1, 2, 3, 4].map(() => ({ spawns: [{ def: 'grunt', count: 2, gap: 0.5 }] })),
    },
    bargains: { ...testBargains(), afterWaves: [1, 2, 3], ...over },
  };
}

type Policy = (offer: ReturnType<typeof perceiveBargains>['open'][number], index: number) => Command | undefined;

const declineAll: Policy = (o) => ({ kind: 'bargain', op: 'decline', offer: o.id });
const acceptFirst: Policy = (o) => {
  const [card] = o.cards;
  return card === undefined ? undefined : { kind: 'bargain', op: 'accept', offer: o.id, card: card.bargain };
};
const ignoreAll: Policy = () => undefined;

/** Steps `n` ticks; before each tick `policy` answers every open offer it has not answered yet. */
function run(sim: Sim, n: number, policy: Policy, onTick?: (events: SimEvent[]) => void): SimEvent[] {
  const all: SimEvent[] = [];
  const answered = new Set<number>();
  for (let i = 0; i < n; i++) {
    for (const [index, offer] of perceiveBargains(sim).open.entries()) {
      const cmd = answered.has(offer.id) ? undefined : policy(offer, index);
      if (cmd !== undefined) {
        answered.add(offer.id);
        sim.command(offer.id % 3, cmd);
      }
    }
    const events = sim.step();
    onTick?.(events);
    all.push(...events);
  }
  return all;
}

function bargainEvents(events: readonly SimEvent[]): Extract<SimEvent, { kind: 'bargain' }>[] {
  return events.flatMap((e) => (e.kind === 'bargain' ? [e] : []));
}

function ancientHp(sim: Sim): number {
  return sim.entities.get(ANCIENT)?.hp ?? Number.NaN;
}

/** Puts a hand-built offer on the sim (cards: bargain ids; hero 0 unless the id names a kit card). */
function giveOffer(sim: Sim, cards: readonly string[], expiresAt = sim.tick + 600): number {
  const state = sim.bargains;
  if (state === undefined) {
    throw new Error('no bargains');
  }
  const id = state.nextOffer;
  state.nextOffer += 1;
  state.offers.push({
    id,
    wave: 1,
    expiresAt,
    cards: cards.map((bargain) => ({ bargain, hero: heroFor(sim, bargain) })),
  });
  return id;
}

function heroFor(sim: Sim, bargain: string): number {
  const def = sim.game.bargains?.pool.find((b) => b.id === bargain);
  if (def?.scope !== 'hero') {
    return 0;
  }
  const hero = sim.game.heroes.findIndex((h) => h.kit === def.kit);
  return hero + 2;
}

describe('offers', () => {
  it('open after the listed waves end, only while a later wave remains', () => {
    const sim = new Sim({ seed: 5, game: quickGame({ afterWaves: [1, 4] }) });
    const events = bargainEvents(run(sim, 1200, ignoreAll));
    const offers = events.filter((e) => e.op === 'offer');
    expect(offers.map((e) => e.wave)).toEqual([1]);
  });

  it('draw distinct cards, at most `cards`, only for kits in the lineup, same seed same draw', () => {
    const game = quickGame({ cards: 3 });
    const noPenitent = { ...game, heroes: game.heroes.filter((h) => h.kit !== 'penitent') };
    const draw = (seed: number): string[][] =>
      bargainEvents(run(new Sim({ seed, game: noPenitent }), 1500, declineAll))
        .filter((e) => e.op === 'offer')
        .map((e) => [...(e.cards ?? [])]);
    for (let seed = 1; seed <= 6; seed++) {
      const offers = draw(seed);
      expect(offers.length).toBeGreaterThan(0);
      for (const cards of offers) {
        expect(new Set(cards).size).toBe(cards.length);
        expect(cards.length).toBeLessThanOrEqual(3);
        expect(cards).not.toContain('test-hair-shirt');
      }
      expect(draw(seed)).toEqual(offers);
    }
  });

  it('never re-offers a taken bargain or one on another open offer', () => {
    const sim = new Sim({ seed: 3, game: quickGame({ cards: 4, afterWaves: [1, 2, 3], windowSeconds: 600 }) });
    const events = bargainEvents(run(sim, 1500, acceptFirst));
    const seen: string[] = [];
    const repeats: string[] = [];
    for (const e of events) {
      repeats.push(...(e.op === 'offer' ? (e.cards ?? []).filter((c) => seen.includes(c)) : []));
      seen.push(...(e.op === 'accept' ? [e.card ?? ''] : []));
    }
    expect(repeats).toEqual([]);
    expect(seen.length).toBeGreaterThan(1);
  });
});

describe('commands', () => {
  it('the first valid resolution wins; later ones and wrong cards are no-ops', () => {
    const sim = new Sim({ seed: 1, game: quickGame() });
    const offer = giveOffer(sim, ['test-tithe', 'test-horde']);
    sim.command(1, { kind: 'bargain', op: 'accept', offer, card: 'test-barrel' }); // not on the offer
    sim.command(2, { kind: 'bargain', op: 'accept', offer, card: 'test-horde' });
    sim.command(0, { kind: 'bargain', op: 'accept', offer, card: 'test-tithe' }); // player 0 sorts first
    sim.command(3, { kind: 'bargain', op: 'decline', offer });
    const events = bargainEvents(sim.step());
    expect(events.map((e) => [e.op, e.card])).toEqual([
      ['accept', 'test-tithe'],
      ['end', undefined],
    ]);
    expect(sim.bargains?.taken.map((t) => t.bargain)).toEqual(['test-tithe']);
    expect(sim.bargains?.offers).toEqual([]);
  });

  it('decline and lapse both heal the Ancient and close the offer', () => {
    for (const lapse of [false, true]) {
      const sim = new Sim({ seed: 1, game: quickGame({ declineAncientHeal: 0.1 }) });
      const ancient = sim.entities.get(ANCIENT);
      if (ancient === undefined) {
        throw new Error('no ancient');
      }
      ancient.hp = 100;
      const offer = giveOffer(sim, ['test-tithe'], sim.tick + 10);
      if (!lapse) {
        sim.command(0, { kind: 'bargain', op: 'decline', offer });
      }
      const events = run(sim, 12, ignoreAll);
      const ops = bargainEvents(events).map((e) => e.op);
      expect(ops).toEqual(lapse ? ['expire', 'end'] : ['decline', 'end']);
      expect(ancient.hp).toBeCloseTo(100 + 0.1 * ancient.maxHp, 9);
      const heals = events.filter((e) => e.kind === 'heal' && e.dst === ANCIENT);
      expect(heals).toHaveLength(1);
    }
  });

  it('a command at or after expiresAt does not resolve the offer (it lapses instead)', () => {
    const sim = new Sim({ seed: 1, game: quickGame() });
    const offer = giveOffer(sim, ['test-tithe'], 5);
    sim.command(0, { kind: 'bargain', op: 'accept', offer, card: 'test-tithe' }, 5);
    const ops = bargainEvents(run(sim, 6, ignoreAll)).map((e) => e.op);
    expect(ops).toEqual(['expire', 'end']);
    expect(sim.bargains?.taken).toEqual([]);
  });
});

describe('effects', () => {
  it('ancientHeal heals once on accept and is capped at max hp', () => {
    const sim = new Sim({ seed: 1, game: quickGame() });
    const ancient = sim.entities.get(ANCIENT);
    if (ancient === undefined) {
      throw new Error('no ancient');
    }
    ancient.hp = 10;
    const offer = giveOffer(sim, ['test-tithe']);
    sim.command(0, { kind: 'bargain', op: 'accept', offer, card: 'test-tithe' });
    sim.step();
    expect(ancient.hp).toBeGreaterThan(10);
    expect(ancient.hp).toBeLessThanOrEqual(ancient.maxHp);
    const after = ancient.hp;
    run(sim, 30, ignoreAll);
    expect(ancient.hp).toBe(after);
  });

  it('target semantics: self, team and allies, and a team card reaches every hero', () => {
    const sim = new Sim({ seed: 1, game: quickGame() });
    const gunner = 2;
    const penitent = 3;
    const offers = [giveOffer(sim, ['test-barrel']), giveOffer(sim, ['test-tithe'])];
    sim.command(0, { kind: 'bargain', op: 'accept', offer: offers[0] ?? 0, card: 'test-barrel' });
    sim.step();
    const mods = createMods(sim.game, sim.bargains);
    const hit = { src: gunner, dst: 9, amount: 1, tags: [] };
    const g = sim.entities.get(gunner);
    const p = sim.entities.get(penitent);
    expect(mods.dealt(g, hit)).toBeGreaterThan(1); // self
    expect(mods.dealt(p, hit)).toBe(1);
    expect(mods.dealt(undefined, hit)).toBe(1);
    sim.command(0, { kind: 'bargain', op: 'accept', offer: offers[1] ?? 0, card: 'test-tithe' });
    sim.step();
    for (const hero of [g, p]) {
      expect(hero && mods.respawn(hero)).toBeGreaterThan(1); // team cost reaches everyone
    }
    const grunt = { ...p, kind: 'enemy' } as NonNullable<typeof p>;
    expect(mods.respawn(grunt)).toBe(1);
  });

  it('a def patch changes the effective def of the benefiting hero only', () => {
    const sim = new Sim({ seed: 1, game: quickGame() });
    const offer = giveOffer(sim, ['test-hair-shirt']);
    const penitent = sim.entities.get(3);
    const gunner = sim.entities.get(2);
    if (penitent === undefined || gunner === undefined) {
      throw new Error('no heroes');
    }
    const base = heroDef(sim, penitent);
    sim.command(0, { kind: 'bargain', op: 'accept', offer, card: 'test-hair-shirt' });
    sim.step();
    const patched = heroDef(sim, penitent);
    if (base?.kit !== 'penitent' || patched?.kit !== 'penitent') {
      throw new Error('not a penitent');
    }
    expect(patched.zeal.maxBonus).toBeGreaterThan(base.zeal.maxBonus);
    expect(base).not.toBe(patched);
    expect(heroDef(sim, gunner)).toBe(sim.game.heroes[0]);
    expect(createMods(sim.game, sim.bargains).heal(penitent, 5)).toBe(0);
    expect(createMods(sim.game, sim.bargains).heal(gunner, 5)).toBe(1);
  });

  it('a maxHp patch rewrites the entity, keeps missing hp, and a timed bargain restores the base on expiry', () => {
    const sim = new Sim({ seed: 1, game: quickGame({ afterWaves: [] }) });
    const gunner = sim.entities.get(2);
    const downed = sim.entities.get(5);
    if (gunner === undefined || downed === undefined) {
      throw new Error('no heroes');
    }
    const base = { maxHp: gunner.maxHp, armour: gunner.armour, speed: gunner.speed };
    gunner.hp = gunner.maxHp - 3;
    downed.hp = 0;
    const offer = giveOffer(sim, ['test-fleeting']);
    sim.command(0, { kind: 'bargain', op: 'accept', offer, card: 'test-fleeting' });
    sim.step();
    expect(gunner.maxHp).toBeGreaterThan(base.maxHp);
    expect(gunner.maxHp - gunner.hp).toBeCloseTo(3, 9);
    expect(downed.hp).toBe(0);
    // Wave 1 (the one wave after offer wave 1... the offer says wave 1, so it covers wave 2) starts and ends.
    const events = bargainEvents(run(sim, 900, ignoreAll));
    const expired = events.filter((e) => e.op === 'expire');
    expect(expired).toHaveLength(1);
    expect(expired[0]?.card).toBe('test-fleeting');
    expect(sim.bargains?.taken).toEqual([]);
    expect(gunner.maxHp).toBe(base.maxHp);
    expect(gunner.armour).toBe(base.armour);
    expect(gunner.speed).toBe(base.speed);
    expect(gunner.hp).toBeLessThanOrEqual(gunner.maxHp);
    expect(gunner.hp).toBeGreaterThan(0);
  });

  it('waveExtra adds groups to waves started after the accept (schedule mode) and to the preview', () => {
    const sim = new Sim({ seed: 1, game: quickGame({ afterWaves: [] }) });
    const offer = giveOffer(sim, ['test-horde']);
    sim.command(0, { kind: 'bargain', op: 'accept', offer, card: 'test-horde' });
    const events = run(sim, 400, ignoreAll);
    const starts = events.filter((e) => e.kind === 'wave' && e.phase === 'start');
    expect(starts.length).toBeGreaterThan(0);
    for (const s of starts) {
      expect(s.kind === 'wave' && s.composition.some((g) => g.def === 'runner' && g.count === 2)).toBe(true);
    }
    const ends = events.flatMap((e) => (e.kind === 'wave' && e.phase === 'end' ? [e] : []));
    expect(ends.filter((e) => e.composition.some((g) => g.def === 'runner'))).toEqual([]);
  });

  it('masterBudget adds to the budget a master-mode wave start grants; waveExtra does not apply', () => {
    const game = quickGame({ afterWaves: [] }, defaultMasterGame());
    const plain = new Sim({ seed: 1, game });
    const taken = new Sim({ seed: 1, game });
    taken.bargains?.taken.push({ bargain: 'test-horde', offer: 1, hero: 0, tick: 0, wave: 1 });
    if (taken.bargains !== undefined) {
      taken.bargains.rev += 1;
    }
    const budgets = (sim: Sim): number => {
      const startEvents = run(sim, 400, ignoreAll).filter((e) => e.kind === 'wave' && e.phase === 'start');
      expect(startEvents.length).toBeGreaterThan(0);
      for (const e of startEvents) {
        expect(e.kind === 'wave' && e.composition.some((g) => g.def === 'runner')).toBe(false);
      }
      return sim.master?.budget ?? Number.NaN;
    };
    const extra = game.bargains?.pool.find((b) => b.id === 'test-horde')?.costs.find((c) => c.kind === 'masterBudget');
    const waves = (s: Sim): number => s.waves.n;
    const diff = budgets(taken) - budgets(plain);
    expect(waves(taken)).toBe(waves(plain));
    expect(diff).toBeCloseTo(waves(taken) * (extra?.kind === 'masterBudget' ? extra.value : Number.NaN), 9);
  });

  it('pauseWaves freezes the wave clock while an offer is open and releases it on resolution', () => {
    const sim = new Sim({ seed: 1, game: quickGame({ pauseWaves: true, windowSeconds: 600 }) });
    run(sim, 1, ignoreAll);
    giveOffer(sim, ['test-tithe']);
    const before = sim.waves.n;
    const left = sim.waves.nextAt - sim.tick;
    run(sim, 200, ignoreAll);
    expect(sim.waves.n).toBe(before);
    expect(sim.waves.nextAt - sim.tick).toBe(left);
    sim.command(0, { kind: 'bargain', op: 'decline', offer: 1 });
    run(sim, left + 5, ignoreAll);
    expect(sim.waves.n).toBeGreaterThan(before);
  });
});

describe('the determinism scenario', () => {
  it('really opens, accepts, declines and lets offers expire', () => {
    const events = bargainEvents(runBargainSim(SEED, TICKS));
    const ops = new Set<string>(events.map((e) => (e.op === 'expire' && e.card !== undefined ? 'expire+card' : e.op)));
    for (const op of ['offer', 'accept', 'decline', 'expire', 'expire+card', 'end']) {
      expect(ops.has(op), op).toBe(true);
    }
  });
});

function allFinite(node: unknown): boolean {
  if (typeof node === 'number') {
    return Number.isFinite(node);
  }
  if (Array.isArray(node)) {
    return node.every(allFinite);
  }
  if (typeof node === 'object' && node !== null) {
    return Object.values(node).every(allFinite);
  }
  return true;
}

const POLICIES: [string, Policy][] = [
  ['declineAll', declineAll],
  ['acceptAll', acceptFirst],
  ['ignoreAll (every offer lapses)', ignoreAll],
  ['mixed', (o, i) => (o.id % 2 === 0 || i > 5 ? declineAll(o, i) : acceptFirst(o, i))],
];

/** What went wrong in one tick: the Ancient's hp must move only by heals and leaks, and nothing may be NaN. */
function tickProblems(sim: Sim, events: readonly SimEvent[], before: number): string[] {
  const problems: string[] = [];
  let expected = before;
  for (const e of events) {
    expected += e.kind === 'heal' && e.dst === ANCIENT ? e.amount : 0;
    expected -= e.kind === 'leak' ? e.livesLost : 0;
    if (e.kind === 'dmg' && e.dst === ANCIENT && !e.tags.includes('leak')) {
      problems.push(`non-leak damage to the Ancient at ${e.tick}`);
    }
  }
  if (Math.abs(ancientHp(sim) - expected) > 1e-6) {
    problems.push(`Ancient hp ${ancientHp(sim)} != ${expected} at ${sim.tick}`);
  }
  if (!allFinite(events)) {
    problems.push(`non-finite event at ${sim.tick}`);
  }
  for (const e of sim.entities.values()) {
    if (!allFinite([e.hp, e.maxHp, e.armour, e.speed, e.x, e.y]) || e.hp > e.maxHp) {
      problems.push(`bad entity ${e.id} at ${sim.tick}`);
    }
  }
  return problems;
}

function countBy(
  events: readonly ReturnType<typeof bargainEvents>[number][],
  pick: (op: string, card?: string) => boolean,
) {
  const counts = new Map<number, number>();
  for (const e of events) {
    counts.set(e.offer, (counts.get(e.offer) ?? 0) + (pick(e.op, e.card) ? 1 : 0));
  }
  return counts;
}

describe.each(POLICIES)('invariants under %s', (_name, policy) => {
  for (const seed of [1, 7, 4242]) {
    it(`seed ${seed}`, () => {
      const sim = new Sim({ seed, game: quickGame({ afterWaves: [1, 2, 3], windowSeconds: 6 }) });
      let hp = ancientHp(sim);
      const problems: string[] = [];
      const events = bargainEvents(
        run(sim, 2400, policy, (tickEvents) => {
          problems.push(...tickProblems(sim, tickEvents, hp));
          hp = ancientHp(sim);
        }),
      );
      expect(problems).toEqual([]);
      // Every offer resolves exactly once (the run is long enough for every window to close), then ends once.
      const offers = events.filter((e) => e.op === 'offer');
      expect(offers.length).toBeGreaterThan(0);
      const resolved = countBy(
        events,
        (op, card) => op === 'accept' || op === 'decline' || (op === 'expire' && card === undefined),
      );
      const ended = countBy(events, (op) => op === 'end');
      expect([...resolved.values()].every((n) => n === 1)).toBe(true);
      expect([...ended.values()].every((n) => n === 1)).toBe(true);
      expect(resolved.size).toBe(offers.length);
      expect(sim.bargains?.offers).toEqual([]);
      // With nothing accepted the effective def is the base def, object for object.
      const heroes = [...sim.entities.values()].filter((e) => e.kind === 'hero');
      const drifted = heroes.filter(
        (e) =>
          (sim.bargains?.taken.length ?? 0) === 0 && heroDef(sim, e) !== sim.game.heroes.find((h) => h.id === e.def),
      );
      expect(drifted).toEqual([]);
    });
  }
});
