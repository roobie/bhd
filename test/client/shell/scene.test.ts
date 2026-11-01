// Scene invariants on the instance buffer (D-4E4QRJ7N6LIGZDSD: no gameplay numbers pinned).
// intentfx is a separate slice; it is replaced by a no-op here so the scene is tested alone.

import { describe, expect, it } from 'vitest';
import { createInstanceBuffer } from '../../../src/client/gl/instances.ts';
import { buildScene, MIN_BODY_PX } from '../../../src/client/shell/scene.ts';
import {
  type Camera,
  type ControlState,
  type Effect,
  type EntitySnap,
  INSTANCE_FLOATS,
  type SceneInput,
  SHAPE,
} from '../../../src/client/shell/types.ts';
import { defaultGame } from '../../../src/content/index.ts';
import { defaultPerception } from '../../../src/content/perception.ts';
import { defaultPresentation } from '../../../src/content/presentation.ts';
import { createMemory } from '../../../src/perception/memory.ts';
import { perceive } from '../../../src/perception/perceive.ts';
import { Sim } from '../../../src/sim/sim.ts';

const game = defaultGame();
const p = perceive(new Sim({ seed: 1, game }), createMemory(defaultPerception()));
const SHAPES = new Set<number>(Object.values(SHAPE));

function camera(pxPerUnit: number): Camera {
  return {
    viewport: { width: 800, height: 600 },
    rotated: false,
    pxPerUnit,
    matrix: new Float32Array(9),
    worldToScreen: (v) => ({ x: v.x * pxPerUnit, y: v.y * pxPerUnit }),
    screenToWorld: (v) => ({ x: v.x / pxPerUnit, y: v.y / pxPerUnit }),
  };
}

const controls: ControlState = {
  selected: 0,
  aim: undefined,
  cursor: undefined,
  arming: { armOn: false, phase: 'off', slot: -1, x: 0, y: 0, fireHalfSeconds: 4, intent: 0, offsetHalfSeconds: 0 },
  paused: false,
  hint: undefined,
};

function heroSnaps(): EntitySnap[] {
  return p.heroes.map((h) => ({
    id: h.id,
    kind: 'hero',
    def: h.def,
    team: 0,
    x: h.x,
    y: h.y,
    radius: 0.6,
    hpFrac: h.hpFrac,
    facing: 0.5,
    statuses: [],
  }));
}

function enemySnaps(n: number): EntitySnap[] {
  return Array.from({ length: n }, (_, i) => ({
    id: 1000 + i,
    kind: 'enemy',
    def: i % 2 === 0 ? 'grunt' : 'mystery',
    team: 1,
    x: 10 + i,
    y: 20,
    radius: 0.5,
    hpFrac: 0.5,
    facing: 0,
    statuses: ['suppressed', 'unknown-status'],
  }));
}

function input(entities: EntitySnap[], pxPerUnit = 10, over: Partial<SceneInput> = {}): SceneInput {
  return {
    map: game.map,
    entities,
    p,
    controls,
    camera: camera(pxPerUnit),
    ui: defaultPresentation(),
    driven: [0],
    effects: [],
    nowMs: 100,
    tickF: p.tick,
    ...over,
  };
}

function run(i: SceneInput): Float32Array {
  const out = createInstanceBuffer(4);
  buildScene(i, out);
  return out.data().slice();
}

describe('buildScene', () => {
  it('emits finite floats and known shape ids', () => {
    const fx: Effect[] = (['hit', 'cast', 'death'] as const).map((kind) => ({
      kind,
      id: 1,
      x: 5,
      y: 5,
      radius: 0.5,
      startMs: 0,
      durationMs: 400,
    }));
    const data = run(input([...heroSnaps(), ...enemySnaps(5)], 10, { effects: fx }));
    expect(data.length % INSTANCE_FLOATS).toBe(0);
    expect(data.every(Number.isFinite)).toBe(true);
    for (let o = 5; o < data.length; o += INSTANCE_FLOATS) {
      expect(SHAPES.has(data[o] ?? -1)).toBe(true);
    }
  });

  it('grows with entities and stays bounded per entity', () => {
    const counts = [0, 1, 10, 40].map((n) => run(input(enemySnaps(n))).length / INSTANCE_FLOATS);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(counts[3] ?? 0).toBeGreaterThan(counts[0] ?? 0);
    const per = ((counts[3] ?? 0) - (counts[0] ?? 0)) / 40;
    expect(per).toBeLessThan(16);
  });

  it('keeps bodies at least MIN_BODY_PX wide at small scale', () => {
    const ppu = 2;
    const tiny: EntitySnap = { ...(enemySnaps(1)[0] as EntitySnap), def: 'grunt', radius: 0.01 };
    const data = run(input([tiny], ppu));
    const sized: number[] = [];
    for (let o = 0; o < data.length; o += INSTANCE_FLOATS) {
      if (data[o] === 10 && data[o + 1] === 20 && data[o + 5] === SHAPE.circle) {
        sized.push(data[o + 2] ?? 0);
      }
    }
    expect(sized.length).toBeGreaterThan(0);
    for (const hw of sized) {
      expect(hw * ppu).toBeGreaterThanOrEqual(MIN_BODY_PX - 1e-4);
    }
  });

  it('falls back for unknown hero and enemy kinds', () => {
    const odd = heroSnaps().map((e) => ({ ...e, def: 'nonesuch' }));
    const enemies = enemySnaps(2).map((e) => ({ ...e, def: 'zzz' }));
    const ui = { abilities: [], resources: [], statuses: [], heroes: [], enemies: [] };
    const data = run(input([...odd, ...enemies], 10, { ui }));
    expect(data.length).toBeGreaterThan(0);
    expect(data.every(Number.isFinite)).toBe(true);
  });

  it('survives a degenerate camera and non-finite entity numbers', () => {
    const bad: EntitySnap = {
      ...(enemySnaps(1)[0] as EntitySnap),
      x: Number.NaN,
      hpFrac: Number.NaN,
      radius: Number.NaN,
    };
    expect(run(input([bad], 0)).every(Number.isFinite)).toBe(true);
  });

  it('draws aim previews for each targeting mode', () => {
    const base = run(input(heroSnaps()));
    for (const targeting of ['instant', 'direction', 'point', 'unit'] as const) {
      const c: ControlState = { ...controls, aim: { slot: 0, targeting }, cursor: { x: 30, y: 30 } };
      const data = run(input(heroSnaps(), 10, { controls: c }));
      expect(data.length).toBeGreaterThan(base.length);
      expect(data.every(Number.isFinite)).toBe(true);
    }
  });

  it('is deterministic', () => {
    const i = input([...heroSnaps(), ...enemySnaps(6)]);
    expect(Array.from(run(i))).toEqual(Array.from(run(i)));
  });
});
