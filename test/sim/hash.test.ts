import { describe, expect, it } from 'vitest';
import { defaultGame, defaultMasterGame } from '../../src/content/index.ts';
import { deriveRng } from '../../src/detmath/index.ts';
import type { Entity, HeroKitState } from '../../src/sim/entities.ts';
import { stateHash } from '../../src/sim/hash.ts';
import { initGunner } from '../../src/sim/heroes/gunner.ts';
import { initPenitent } from '../../src/sim/heroes/penitent.ts';
import { initPsyker } from '../../src/sim/heroes/psyker.ts';
import { initStandin } from '../../src/sim/heroes/standins.ts';
import { Sim } from '../../src/sim/sim.ts';
import { testBargains } from '../bargains-fixture.ts';

type Tree = Record<string, unknown>;

const GUNNER = 2;
const PENITENT = 3;
const PSYKER = 4;
const SUPPORT = 5;
const HEROES = [GUNNER, PENITENT, PSYKER, SUPPORT];
const REPLACEMENTS: Record<string, string> = {
  kind: 'enemy',
  'move.mode': 'point',
};

function fixture(game = defaultGame()): Sim {
  const sim = new Sim({ seed: 3, game });
  for (const id of HEROES) {
    const h = sim.entities.get(id);
    if (h === undefined) {
      throw new Error('no hero');
    }
    h.statuses.push({ status: 'marked', until: 40, src: 3, value: 2 });
    h.move = { mode: 'idle', tx: 1, ty: 2, waypoint: 3 };
    h.attack = { cooldown: 1.5, target: 5 };
  }
  sim.waves.queue.push({ at: 9, def: 'grunt', wave: 1 });
  // A prop (Pavise), so every prop leaf exists to perturb.
  sim.entities.add({
    kind: 'prop',
    def: 'pavise',
    team: 0,
    x: 5,
    y: 6,
    radius: 0,
    maxHp: 1,
    armour: 0,
    speed: 0,
    prop: { owner: GUNNER, until: 50, ux: 0, uy: 1, halfLength: 1.5 },
  });
  // Board and master state, built by hand so every leaf (incl. a reservation) exists to perturb.
  sim.intents.nextId = 3;
  sim.intents.live.push({
    id: 2,
    by: GUNNER,
    slot: 1,
    intentKind: 'pull',
    x: 4,
    y: 5,
    fireTick: 60,
    fired: false,
    reservations: [{ hero: SUPPORT, slot: 0, offset: 6 }],
  });
  if (sim.master !== undefined) {
    sim.master.budget = 7;
    sim.master.lastStart = 3;
    sim.master.pending.push({ def: 'grunt', count: 2 });
    sim.master.started.push({ n: 1, composition: [{ def: 'brute', count: 1 }] });
  }
  if (sim.bargains !== undefined) {
    // Populated by hand so every leaf (an offer with cards, a taken bargain) exists to perturb.
    sim.bargains.nextOffer = 3;
    sim.bargains.opened = 1;
    sim.bargains.offers.push({
      id: 2,
      wave: 1,
      expiresAt: 90,
      cards: [
        { bargain: 'test-barrel', hero: GUNNER },
        { bargain: 'test-tithe', hero: 0 },
      ],
    });
    sim.bargains.taken.push({ bargain: 'test-horde', offer: 1, hero: 0, tick: 5, wave: 1 });
  }
  return sim;
}

function hashOf(sim: Sim, over: { tick?: number; ended?: boolean } = {}): string {
  return stateHash({
    tick: over.tick ?? 7,
    ended: over.ended ?? false,
    entities: sim.entities,
    waves: sim.waves,
    rng: sim.rng,
    intents: sim.intents,
    master: sim.master,
    bargains: sim.bargains,
  });
}

function leafPaths(node: unknown, prefix: string[], out: string[][]): void {
  if (Array.isArray(node)) {
    node.forEach((child, i) => {
      leafPaths(child, [...prefix, String(i)], out);
    });
  } else if (typeof node === 'object' && node !== null) {
    for (const [k, v] of Object.entries(node)) {
      leafPaths(v, [...prefix, k], out);
    }
  } else {
    out.push(prefix);
  }
}

/** A real kit of another kind, swapped in to perturb `kit.kind`: gunner -> stand-in -> penitent -> psyker -> gunner (each hash branch reads its own fields). */
function otherKit(hero: Entity): HeroKitState {
  const game = defaultGame();
  const standin = game.heroes.find((h) => h.kit === 'standin');
  const gunner = game.heroes.find((h) => h.kit === 'gunner');
  const penitent = game.heroes.find((h) => h.kit === 'penitent');
  const psyker = game.heroes.find((h) => h.kit === 'psyker');
  if (
    standin?.kit !== 'standin' ||
    gunner?.kit !== 'gunner' ||
    penitent?.kit !== 'penitent' ||
    psyker?.kit !== 'psyker'
  ) {
    throw new Error('default lineup changed');
  }
  switch (hero.kit?.kind) {
    case 'gunner':
      return initStandin(standin);
    case 'standin':
      return initPenitent(penitent);
    case 'penitent':
      return initPsyker(psyker, deriveRng(1, 'kit:test'));
    case 'psyker':
      return initGunner(gunner);
    default:
      throw new Error('hero without a kit');
  }
}

function perturb(root: Tree, path: string[], alt?: HeroKitState): void {
  if (alt !== undefined && path.join('.') === 'kit.kind') {
    root.kit = alt as unknown as Tree;
    return;
  }
  const parent = path.slice(0, -1).reduce<Tree>((n, k) => n[k] as Tree, root);
  const key = path.at(-1) ?? '';
  const v = parent[key];
  if (typeof v === 'number') {
    parent[key] = v + 1;
  } else if (typeof v === 'boolean') {
    parent[key] = !v;
  } else {
    parent[key] = REPLACEMENTS[path.join('.')] ?? `${String(v)}x`;
  }
}

describe('state hash covers every field', () => {
  const base = hashOf(fixture());

  it('is stable for identical state', () => {
    expect(hashOf(fixture())).toBe(base);
  });

  it.each([
    ['gunner', GUNNER, ['kit.spin', 'kit.heat', 'kit.cdFurnace']],
    ['penitent', PENITENT, ['kit.pain', 'kit.cdChain', 'kit.martyrdomTicks', 'kit.spentTicks', 'kit.respawnAt']],
    ['psyker', PSYKER, ['kit.warp', 'kit.cdLash', 'kit.rng.state.0', 'kit.rng.state.3', 'kit.respawnAt']],
    ['stand-in', SUPPORT, ['kit.cooldowns.0', 'kit.cooldowns.3']],
  ])('changes when any leaf of the %s hero entity (incl. nested and kit) changes', (_name, id, kitLeaves) => {
    const paths: string[][] = [];
    const probe = fixture().entities.get(id);
    leafPaths(probe, [], paths);
    // Sanity: the walk reaches nested entries and kit fields.
    const joined = paths.map((p) => p.join('.'));
    expect(joined).toEqual(
      expect.arrayContaining([
        'statuses.0.until',
        'move.waypoint',
        'attack.cooldown',
        'kit.kind',
        'kit.hold',
        'kit.autocast',
        ...kitLeaves,
      ]),
    );
    for (const path of paths) {
      const sim = fixture();
      const hero = sim.entities.get(id);
      if (hero === undefined) {
        throw new Error('no hero');
      }
      perturb(hero as unknown as Tree, path, otherKit(hero));
      expect(hashOf(sim), path.join('.')).not.toBe(base);
    }
  });

  it('changes when any prop field changes', () => {
    const paths: string[][] = [];
    const prop = [...fixture().entities.values()].find((e) => e.kind === 'prop');
    leafPaths(prop, [], paths);
    expect(paths.map((p) => p.join('.'))).toEqual(
      expect.arrayContaining(['prop.owner', 'prop.until', 'prop.ux', 'prop.uy', 'prop.halfLength']),
    );
    for (const path of paths) {
      const sim = fixture();
      const target = [...sim.entities.values()].find((e) => e.kind === 'prop');
      if (target === undefined) {
        throw new Error('no prop');
      }
      perturb(target as unknown as Tree, path);
      expect(hashOf(sim), path.join('.')).not.toBe(base);
    }
  });

  it('changes when any wave scheduler field changes', () => {
    const paths: string[][] = [];
    leafPaths(fixture().waves, [], paths);
    expect(paths.length).toBeGreaterThanOrEqual(4);
    for (const path of paths) {
      const sim = fixture();
      perturb(sim.waves as unknown as Tree, path);
      expect(hashOf(sim), path.join('.')).not.toBe(base);
    }
  });

  it('changes when any intents board field changes', () => {
    const paths: string[][] = [];
    leafPaths(fixture().intents, [], paths);
    expect(paths.map((p) => p.join('.'))).toEqual(
      expect.arrayContaining(['nextId', 'live.0.fireTick', 'live.0.fired', 'live.0.reservations.0.offset']),
    );
    for (const path of paths) {
      const sim = fixture();
      perturb(sim.intents as unknown as Tree, path);
      expect(hashOf(sim), path.join('.')).not.toBe(base);
    }
  });

  it('changes when any wave master field changes', () => {
    const masterBase = hashOf(fixture(defaultMasterGame()));
    expect(masterBase).not.toBe(base);
    const paths: string[][] = [];
    const probe = fixture(defaultMasterGame()).master;
    leafPaths(probe, [], paths);
    expect(paths.map((p) => p.join('.'))).toEqual(
      expect.arrayContaining(['budget', 'lastStart', 'pending.0.count', 'started.0.composition.0.def']),
    );
    for (const path of paths) {
      const sim = fixture(defaultMasterGame());
      perturb(sim.master as unknown as Tree, path);
      expect(hashOf(sim), path.join('.')).not.toBe(masterBase);
    }
  });

  it('changes when any bargains field changes, rng words included', () => {
    const game = { ...defaultGame(), bargains: testBargains() };
    const bargainsBase = hashOf(fixture(game));
    expect(bargainsBase).not.toBe(base);
    const paths: string[][] = [];
    leafPaths(fixture(game).bargains, [], paths);
    expect(paths.map((p) => p.join('.'))).toEqual(
      expect.arrayContaining([
        'nextOffer',
        'opened',
        'offers.0.expiresAt',
        'offers.0.cards.1.hero',
        'taken.0.bargain',
        'taken.0.tick',
      ]),
    );
    for (const path of paths) {
      const sim = fixture(game);
      perturb(sim.bargains as unknown as Tree, path);
      expect(hashOf(sim), path.join('.')).not.toBe(bargainsBase);
    }
  });

  it('changes with tick, ended flag, each rng word, and entity count', () => {
    expect(hashOf(fixture(), { tick: 8 })).not.toBe(base);
    expect(hashOf(fixture(), { ended: true })).not.toBe(base);
    const n = fixture().rng.state.length;
    for (let i = 0; i < n; i++) {
      const sim = fixture();
      sim.rng.state[i] = (sim.rng.state[i] ?? 0) + 1;
      expect(hashOf(sim), `rng ${i}`).not.toBe(base);
    }
    const sim = fixture();
    sim.entities.add({ kind: 'enemy', def: 'grunt', team: 1, x: 0, y: 0, radius: 1, maxHp: 1, armour: 0, speed: 0 });
    expect(hashOf(sim)).not.toBe(base);
  });
});
