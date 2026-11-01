import { describe, expect, it } from 'vitest';
import { defaultGame } from '../../src/content/index.ts';
import { stateHash } from '../../src/sim/hash.ts';
import { Sim } from '../../src/sim/sim.ts';

type Tree = Record<string, unknown>;

const GUNNER = 2;
const REPLACEMENTS: Record<string, string> = {
  kind: 'enemy',
  'move.mode': 'point',
  'kit.kind': 'standin',
};

function fixture(): Sim {
  const sim = new Sim({ seed: 3, game: defaultGame() });
  const g = sim.entities.get(GUNNER);
  if (g === undefined) {
    throw new Error('no gunner');
  }
  g.statuses.push({ status: 'marked', until: 40, src: 3, value: 2 });
  g.move = { mode: 'idle', tx: 1, ty: 2, waypoint: 3 };
  g.attack = { cooldown: 1.5, target: 5 };
  sim.waves.queue.push({ at: 9, def: 'grunt', wave: 1 });
  return sim;
}

function hashOf(sim: Sim, over: { tick?: number; ended?: boolean } = {}): string {
  return stateHash({
    tick: over.tick ?? 7,
    ended: over.ended ?? false,
    entities: sim.entities,
    waves: sim.waves,
    rng: sim.rng,
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

function perturb(root: Tree, path: string[]): void {
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

  it('changes when any leaf of the hero entity (incl. nested and kit) changes', () => {
    const paths: string[][] = [];
    const probe = fixture().entities.get(GUNNER);
    leafPaths(probe, [], paths);
    // Sanity: the walk reaches nested entries and kit fields.
    const joined = paths.map((p) => p.join('.'));
    expect(joined).toEqual(
      expect.arrayContaining(['statuses.0.until', 'move.waypoint', 'attack.cooldown', 'kit.hold', 'kit.autocast']),
    );
    for (const path of paths) {
      const sim = fixture();
      perturb(sim.entities.get(GUNNER) as unknown as Tree, path);
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
