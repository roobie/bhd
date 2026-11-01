import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudio } from '../../../src/client/audio.ts';
import { createFeedback, HITSTOP_WOMBO_MS } from '../../../src/client/shell/feedback.ts';
import { advanceEffects, genericFx } from '../../../src/client/shell/snapshot.ts';
import type { EntitySnap, Snapshot } from '../../../src/client/shell/types.ts';
import type { SimEvent } from '../../../src/sim/events.ts';

const ent = (id: number, kind: EntitySnap['kind'], x: number): EntitySnap => ({
  id,
  kind,
  def: 'd',
  team: kind === 'enemy' ? 1 : 0,
  x,
  y: 0,
  radius: 0.5,
  hpFrac: 1,
  facing: 0,
  statuses: [],
});
const snap: Snapshot = { tick: 1, entities: [ent(1, 'hero', 0), ent(2, 'hero', 4), ent(10, 'enemy', 8)] };
const womboAt = (tick: number): SimEvent[] => [
  { tick, kind: 'intent', id: tick, op: 'fire', by: 1, intentKind: 'pull' },
  { tick, kind: 'intent', id: tick, op: 'fulfil', by: 2, intentKind: 'pull' },
  { tick, kind: 'intent', id: tick, op: 'fulfil', by: 1, intentKind: 'pull' },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('feedback', () => {
  it('a wombo makes a big callout and a hitstop', () => {
    const fb = createFeedback();
    fb.onStep(womboAt(1), snap, 1000);
    const c = fb.callouts(1100);
    expect(c).toHaveLength(1);
    expect(c[0]?.big).toBe(true);
    expect(fb.callouts(1000 + 5000)).toEqual([]);
    expect(fb.visualTime(1000 + HITSTOP_WOMBO_MS / 2)).toBeLessThan(1000 + HITSTOP_WOMBO_MS / 2);
  });

  it('same-kind callouts close in space and time merge into one with a count', () => {
    const fb = createFeedback();
    fb.onStep(womboAt(1), snap, 1000);
    const first = fb.callouts(1050)[0]?.count ?? 0;
    fb.onStep(womboAt(2), snap, 1100);
    const c = fb.callouts(1150);
    expect(c).toHaveLength(1);
    expect(c[0]?.count).toBe(first * 2);
    expect(c[0]?.text).toContain(`x${first * 2}`);
  });

  it('far-apart callouts stay separate, and only a few are visible at once', () => {
    const fb = createFeedback();
    for (let i = 0; i < 12; i++) {
      const far: Snapshot = { tick: 1, entities: [ent(1, 'hero', i * 50), ent(2, 'hero', i * 50 + 2)] };
      fb.onStep(womboAt(i + 1), far, 1000 + i);
    }
    const n = fb.callouts(1100).length;
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThanOrEqual(6);
  });

  it('visual time is monotonic, never ahead of real time, and catches up after a hitstop', () => {
    const fb = createFeedback();
    let last = Number.NEGATIVE_INFINITY;
    let now = 0;
    for (let i = 0; i < 400; i++) {
      now += 8 + (i % 5);
      if (i % 37 === 0) {
        fb.onStep(womboAt(i), snap, now);
      }
      const v = fb.visualTime(now);
      expect(v).toBeGreaterThanOrEqual(last);
      expect(v).toBeLessThanOrEqual(now);
      expect(now - v).toBeLessThanOrEqual(200 + 1e-9);
      last = v;
    }
    expect(fb.visualTime(now + 5000)).toBe(now + 5000);
  });

  it('without payoffs visual time is real time', () => {
    const fb = createFeedback();
    for (const t of [0, 16, 33, 50]) {
      expect(fb.visualTime(t)).toBe(t);
    }
  });
});

describe('audio', () => {
  it('is a safe no-op with no AudioContext', () => {
    const a = createAudio();
    expect(() => {
      a.unlock();
      a.play('cashin');
      a.play('wombo');
      a.play('backlash');
      a.play('respawn');
      a.dispose();
    }).not.toThrow();
  });

  it('survives a context that throws', () => {
    vi.stubGlobal(
      'AudioContext',
      class {
        constructor() {
          throw new Error('nope');
        }
      },
    );
    const a = createAudio();
    a.unlock();
    expect(() => a.play('wombo')).not.toThrow();
    a.dispose();
  });
});

describe('generic effects', () => {
  it('unknown kinds fall through silently; named ones flash', () => {
    const plain: SimEvent = { tick: 1, kind: 'dmg', src: 10, dst: 1, amount: 1, tags: ['melee'] };
    expect(genericFx(plain)).toBeUndefined();
    const tagged: SimEvent = { tick: 1, kind: 'dmg', src: 1, dst: 10, amount: 1, tags: ['ability:martyrdom'] };
    expect(genericFx(tagged)).toBe('nova');
    const future = { tick: 1, kind: 'backlash', hero: 1 } as unknown as SimEvent;
    expect(genericFx(future)).toBe('backlash');
    expect(advanceEffects([], [future], snap, 0).map((f) => f.kind)).toEqual(['backlash']);
    const bogus = { tick: 1, kind: 'zzz' } as unknown as SimEvent;
    expect(advanceEffects([], [bogus], snap, 0)).toEqual([]);
  });
});
