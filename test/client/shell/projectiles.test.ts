import { describe, expect, it } from 'vitest';
import { createInstanceBuffer } from '../../../src/client/gl/instances.ts';
import { buildScene } from '../../../src/client/shell/scene.ts';
import { advanceEffects } from '../../../src/client/shell/snapshot.ts';
import type { Camera, ControlState, EntitySnap, Snapshot } from '../../../src/client/shell/types.ts';
import { INSTANCE_FLOATS } from '../../../src/client/shell/types.ts';
import { defaultGame } from '../../../src/content/index.ts';
import { defaultPerception } from '../../../src/content/perception.ts';
import { defaultPresentation } from '../../../src/content/presentation.ts';
import { createMemory } from '../../../src/perception/memory.ts';
import { perceive } from '../../../src/perception/perceive.ts';
import type { SimEvent } from '../../../src/sim/events.ts';
import { Sim } from '../../../src/sim/sim.ts';

function ent(id: number, kind: EntitySnap['kind'], def: string, at: [number, number]): EntitySnap {
  const [x, y] = at;
  return { id, kind, def, team: kind === 'enemy' ? 1 : 0, x, y, radius: 0.5, hpFrac: 1, facing: 0, statuses: [] };
}

const dmg = (src: number, dst: number, tags: string[] = []): SimEvent => ({
  tick: 1,
  kind: 'dmg',
  src,
  dst,
  amount: 1,
  tags,
});
const snap: Snapshot = {
  tick: 1,
  entities: [ent(1, 'hero', 'gunner', [0, 0]), ent(2, 'enemy', 'grunt', [10, 0]), ent(3, 'enemy', 'grunt', [1, 0])],
};

describe('shot effects', () => {
  it('only basic autoattacks get a tracer, never melee, leak, cone or ability hits', () => {
    for (const tags of [['melee'], ['leak'], ['cone'], ['cone', 'ability:vent'], ['ability:suppress']]) {
      const out = advanceEffects([], [dmg(1, 2, tags)], snap, 0);
      expect(
        out.map((f) => f.kind),
        tags.join(),
      ).toEqual(['hit']);
    }
    expect(advanceEffects([], [dmg(1, 2, ['pierce', 'overpen'])], snap, 0).map((f) => f.kind)).toContain('shot');
  });

  it('an ability hit does not suppress the same source autoattack tracer', () => {
    const out = advanceEffects([], [dmg(1, 3, ['cone', 'ability:vent']), dmg(1, 2)], snap, 0);
    expect(out.filter((f) => f.kind === 'shot')).toHaveLength(1);
  });

  it('the hit and death land when the tracer does', () => {
    const death: SimEvent = { tick: 1, kind: 'death', id: 2, killer: 1 };
    const out = advanceEffects([], [dmg(1, 2), death], snap, 1000);
    const shot = out.find((f) => f.kind === 'shot');
    expect(shot).toBeDefined();
    for (const f of out.filter((x) => x.kind === 'hit' || x.kind === 'death')) {
      expect(f.startMs).toBe(1000 + (shot?.durationMs ?? 0));
    }
    const melee = advanceEffects([], [dmg(3, 1, ['melee'])], snap, 1000);
    expect(melee[0]?.startMs).toBe(1000);
  });

  it('catch-up steps in one frame do not stack tracers from one source', () => {
    let fx = advanceEffects([], [dmg(1, 2)], snap, 500);
    fx = advanceEffects(fx, [dmg(1, 2)], snap, 500);
    fx = advanceEffects(fx, [dmg(1, 2)], snap, 500);
    expect(fx.filter((f) => f.kind === 'shot')).toHaveLength(1);
    fx = advanceEffects(fx, [dmg(1, 2)], snap, 520);
    expect(fx.filter((f) => f.kind === 'shot')).toHaveLength(2);
  });

  it('remembers the target id so the tracer can follow it', () => {
    const shot = advanceEffects([], [dmg(1, 2)], snap, 0).find((f) => f.kind === 'shot');
    expect(shot?.toId).toBe(2);
  });

  it('a ranged hit yields one hit and one shot, a melee hit no shot', () => {
    const far = advanceEffects([], [dmg(1, 2)], snap, 0);
    expect(far.map((f) => f.kind)).toEqual(['shot', 'hit']);
    const near = advanceEffects([], [dmg(3, 1)], snap, 0);
    expect(near.map((f) => f.kind)).toEqual(['hit']);
  });

  it('one shot per source per call', () => {
    const out = advanceEffects([], [dmg(1, 2), dmg(1, 3), dmg(1, 2)], snap, 0);
    expect(out.filter((f) => f.kind === 'shot')).toHaveLength(1);
  });

  it('expires, with a short finite flight', () => {
    const shot = advanceEffects([], [dmg(1, 2)], snap, 1000).find((f) => f.kind === 'shot');
    expect(shot).toBeDefined();
    expect(shot?.durationMs).toBeGreaterThanOrEqual(80);
    expect(shot?.durationMs).toBeLessThanOrEqual(200);
    expect(advanceEffects(shot ? [shot] : [], [], snap, 1000 + 250)).toHaveLength(0);
  });

  it('caps live shots', () => {
    const entities: EntitySnap[] = [ent(1000, 'enemy', 'grunt', [20, 0])];
    const events: SimEvent[] = [];
    for (let i = 0; i < 200; i++) {
      entities.push(ent(i + 1, 'hero', 'gunner', [0, i]));
      events.push(dmg(i + 1, 1000));
    }
    const s: Snapshot = { tick: 1, entities };
    let fx = advanceEffects([], events, s, 0);
    const cap = fx.filter((f) => f.kind === 'shot').length;
    expect(cap).toBeGreaterThan(0);
    expect(cap).toBeLessThan(100);
    fx = advanceEffects(fx, events, s, 1);
    expect(fx.filter((f) => f.kind === 'shot')).toHaveLength(cap);
  });

  it('draws between source and target, finite, at every age', () => {
    const game = defaultGame();
    const p = perceive(new Sim({ seed: 1, game }), createMemory(defaultPerception()));
    const shot = advanceEffects([], [dmg(1, 2)], snap, 0).find((f) => f.kind === 'shot');
    const cam: Camera = {
      viewport: { width: 800, height: 600 },
      rotated: false,
      pxPerUnit: 10,
      matrix: new Float32Array(9),
      worldToScreen: (v) => v,
      screenToWorld: (v) => v,
      isMapPoint: () => true,
    };
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
      help: false,
      hint: undefined,
    };
    const dur = shot?.durationMs ?? 100;
    // The target is drawn at x 10 (where it was hit) or has since moved to x 4: the tracer follows it.
    for (const [age, targetX] of [0, 0.25, 0.5, 0.99].flatMap((a) => [[a, 10] as const, [a, 4] as const])) {
      const out = createInstanceBuffer(4);
      buildScene(
        {
          map: game.map,
          entities: [ent(2, 'enemy', 'grunt', [targetX, 0])],
          p,
          controls,
          camera: cam,
          ui: defaultPresentation(),
          driven: [],
          effects: shot ? [shot] : [],
          nowMs: age * dur,
          tickF: 0,
        },
        out,
      );
      const d = out.data();
      expect(d.every(Number.isFinite)).toBe(true);
      // The last instance is the bright head; it lies on the line from x 0 to x 10.
      const x = d.at(-INSTANCE_FLOATS) ?? Number.NaN;
      expect(x).toBeGreaterThanOrEqual(-1e-6);
      expect(x).toBeLessThanOrEqual(targetX + 1e-6);
    }
  });
});
