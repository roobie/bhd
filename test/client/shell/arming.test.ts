// Arming invariants (D-4E4QRJ7N6LIGZDSD): command shapes validate, fire time is clamped, late
// reserves are refused, cancel backs out, unrelated actions are not handled. No gameplay numbers.

import { describe, expect, it } from 'vitest';
import { createInstanceBuffer } from '../../../src/client/gl/instances.ts';
import {
  ARM_DEFAULT_HALF_SECONDS,
  ARM_MAX_HALF_SECONDS,
  ARM_MIN_HALF_SECONDS,
  initialArming,
  reduceArming,
} from '../../../src/client/shell/arming.ts';
import { intentInstances } from '../../../src/client/shell/intentfx.ts';
import {
  type ArmingState,
  type ControlContext,
  INPUT_DELAY_TICKS,
  INSTANCE_FLOATS,
  type UiAction,
} from '../../../src/client/shell/types.ts';
import type { Presentation } from '../../../src/content/presentation.ts';
import type { AbilityView, HeroView, IntentView, Perception } from '../../../src/perception/types.ts';
import { type Command, isValidCommand } from '../../../src/sim/commands.ts';

const ui: Presentation = {
  abilities: [
    { effect: 'a', label: 'A', glyph: 'A', targeting: 'point', armable: true, intentKind: 'kindA' },
    { effect: 'b', label: 'B', glyph: 'B', targeting: 'instant', armable: true },
    { effect: 'c', label: 'C', glyph: 'C', targeting: 'point', armable: false },
  ],
  resources: [],
  statuses: [],
  heroes: [],
  enemies: [],
};

function ability(slot: number, effect: string): AbilityView {
  return { slot, effect, ready: true, cooldownLeft: 0, cooldownTicks: 0, range: 5, radius: 1 };
}

function hero(slot: number, id: number): HeroView {
  return {
    id,
    slot,
    def: 'h',
    kit: 'standin',
    role: 'tank',
    x: 3,
    y: 4,
    hp: 10,
    maxHp: 10,
    hpFrac: 1,
    threat: 0,
    recentDamage: 0,
    resources: [],
    abilities: [ability(0, 'a'), ability(1, 'b'), ability(2, 'c')],
    statuses: [],
    dest: undefined,
    target: 0,
    hold: false,
    autocast: 0,
    lineAllies: [],
  } as HeroView;
}

function intent(id: number, by: number, fireTick: number, extra: Partial<IntentView> = {}): IntentView {
  return { id, by, intentKind: 'pull', x: 1, y: 2, fireTick, fired: false, reservers: [], ...extra };
}

function ctxWith(intents: IntentView[], driven: number[] = [0], tick = 100): ControlContext {
  const p = { tick, heroes: [hero(0, 11), hero(1, 12)], intents } as unknown as Perception;
  return { p, driven, ui };
}

function run(a: ArmingState, actions: UiAction[], ctx: ControlContext): { a: ArmingState; cmds: Command[] } {
  let cur = a;
  const cmds: Command[] = [];
  for (const act of actions) {
    const s = reduceArming(cur, act, ctx, 0);
    cur = s.arming;
    cmds.push(...s.commands);
  }
  return { a: cur, cmds };
}

describe('arming a trigger', () => {
  const ctx = ctxWith([]);

  it('posts at the picked point with the default fire time', () => {
    const { a, cmds } = run(
      initialArming(),
      [{ kind: 'armToggle' }, { kind: 'cast', slot: 0 }, { kind: 'primary', x: 7, y: 8 }, { kind: 'armConfirm' }],
      ctx,
    );
    expect(cmds).toHaveLength(1);
    const c = cmds[0] as Command;
    expect(c).toMatchObject({ kind: 'intent', op: 'post', hero: 11, slot: 0, intentKind: 'kindA', x: 7, y: 8 });
    expect(isValidCommand(c)).toBe(true);
    expect(a.phase).toBe('off');
    expect(a.armOn).toBe(true);
    expect(ARM_DEFAULT_HALF_SECONDS).toBeGreaterThanOrEqual(ARM_MIN_HALF_SECONDS);
  });

  it('instant abilities go straight to the picker at the hero', () => {
    const { a } = run(initialArming(), [{ kind: 'cast', slot: 1, arm: true }], ctx);
    expect(a).toMatchObject({ phase: 'time', slot: 1, x: 3, y: 4 });
  });

  it('clamps the fire time to the allowed range', () => {
    const base = run(initialArming(), [{ kind: 'cast', slot: 1, arm: true }], ctx).a;
    const low = run(base, [{ kind: 'fireTime', halfSeconds: -100 }], ctx).a;
    const high = run(base, [{ kind: 'fireTime', halfSeconds: 100 }], ctx).a;
    expect(low.fireHalfSeconds).toBe(ARM_MIN_HALF_SECONDS);
    expect(high.fireHalfSeconds).toBe(ARM_MAX_HALF_SECONDS);
    for (const s of [low, high]) {
      const { cmds } = run(s, [{ kind: 'armConfirm' }], ctx);
      expect(cmds.every(isValidCommand)).toBe(true);
      expect(cmds).toHaveLength(1);
    }
  });

  it('does not arm an unarmable ability', () => {
    const s = reduceArming(initialArming(), { kind: 'cast', slot: 2, arm: true }, ctx, 0);
    expect(s.handled).toBe(false);
  });

  it('refuses a second pending post by the same hero', () => {
    const busy = ctxWith([intent(5, 11, 200)]);
    const s = reduceArming(initialArming(), { kind: 'cast', slot: 0, arm: true }, busy, 0);
    expect(s.commands).toHaveLength(0);
    expect(s.hint).toBeDefined();
    expect(s.arming.phase).toBe('off');
  });

  it('emits nothing for a bot or dead hero', () => {
    const bot = ctxWith([], []);
    expect(reduceArming(initialArming(), { kind: 'cast', slot: 0, arm: true }, bot, 0).handled).toBe(false);
    const dead = ctxWith([], [3]);
    expect(reduceArming(initialArming(), { kind: 'cast', slot: 0, arm: true }, dead, 3).handled).toBe(false);
  });
});

describe('reserving and cancelling', () => {
  it('reserves a bot intent with the picked offset', () => {
    const ctx = ctxWith([intent(5, 12, 200)]);
    const { a, cmds } = run(
      initialArming(),
      [
        { kind: 'pickIntent', id: 5 },
        { kind: 'reserveOffset', halfSeconds: 2 },
        { kind: 'cast', slot: 1 },
      ],
      ctx,
    );
    expect(cmds).toHaveLength(1);
    const c = cmds[0] as Command;
    expect(c).toMatchObject({ kind: 'intent', op: 'reserve', hero: 11, intent: 5, slot: 1 });
    expect(isValidCommand(c)).toBe(true);
    expect(a.phase).toBe('off');
  });

  it('refuses a reserve that is too late for the input delay', () => {
    const tick = 100;
    const late = ctxWith([intent(5, 12, tick + INPUT_DELAY_TICKS)], [0], tick);
    const ok = ctxWith([intent(5, 12, tick + INPUT_DELAY_TICKS + 1)], [0], tick);
    const acts: UiAction[] = [
      { kind: 'pickIntent', id: 5 },
      { kind: 'cast', slot: 0 },
    ];
    const r1 = run(initialArming(), acts, late);
    expect(r1.cmds).toHaveLength(0);
    expect(run(initialArming(), acts, ok).cmds).toHaveLength(1);
    const fired = ctxWith([intent(5, 12, 50, { fired: true })]);
    expect(run(initialArming(), acts, fired).cmds).toHaveLength(0);
  });

  it('refuses reserving its own intent', () => {
    const ctx = ctxWith([intent(5, 11, 300)]);
    const { cmds } = run(
      initialArming(),
      [
        { kind: 'pickIntent', id: 5 },
        { kind: 'cast', slot: 0 },
      ],
      ctx,
    );
    expect(cmds).toHaveLength(0);
  });

  it('cancels its own intent or reservation, and only those', () => {
    const ctx = ctxWith([intent(5, 11, 300), intent(6, 12, 300, { reservers: [11] }), intent(7, 12, 300)]);
    for (const id of [5, 6]) {
      const s = reduceArming(initialArming(), { kind: 'cancelIntent', id }, ctx, 0);
      expect(s.commands).toHaveLength(1);
      expect(s.commands.every(isValidCommand)).toBe(true);
    }
    const other = reduceArming(initialArming(), { kind: 'cancelIntent', id: 7 }, ctx, 0);
    expect(other.commands).toHaveLength(0);
    expect(other.hint).toBeDefined();
  });

  it('cancel backs out of every phase', () => {
    const ctx = ctxWith([intent(5, 12, 300)]);
    const states = [
      run(initialArming(), [{ kind: 'cast', slot: 0, arm: true }], ctx).a,
      run(initialArming(), [{ kind: 'cast', slot: 1, arm: true }], ctx).a,
      run(initialArming(), [{ kind: 'pickIntent', id: 5 }], ctx).a,
    ];
    for (const s of states) {
      expect(s.phase).not.toBe('off');
      const out = reduceArming(s, { kind: 'cancel' }, ctx, 0);
      expect(out.handled).toBe(true);
      expect(out.arming.phase).toBe('off');
      expect(out.commands).toHaveLength(0);
    }
  });

  it('leaves unrelated actions alone', () => {
    const ctx = ctxWith([]);
    const acts: UiAction[] = [
      { kind: 'select', slot: 1 },
      { kind: 'hover', x: 1, y: 1 },
      { kind: 'stop' },
      { kind: 'hold' },
      { kind: 'pause' },
      { kind: 'restart' },
      { kind: 'autocast', slot: 0 },
      { kind: 'primary', x: 1, y: 1 },
      { kind: 'cancel' },
      { kind: 'fireTime', halfSeconds: 1 },
    ];
    for (const act of acts) {
      const s = reduceArming(initialArming(), act, ctx, 0);
      expect(s.handled).toBe(false);
      expect(s.commands).toHaveLength(0);
    }
  });
});

describe('intentInstances', () => {
  it('writes finite instances only, including odd inputs', () => {
    const intents = [intent(5, 12, 300, { reservers: [11, 12, 99] }), intent(6, 11, 90, { fired: true })];
    const p = { tick: 100, heroes: [hero(0, 11), hero(1, 12)], intents } as unknown as Perception;
    const phases = ['off', 'aim', 'time', 'reserve'] as const;
    for (const phase of phases) {
      for (const pxPerUnit of [0, 0.01, 40, Number.NaN]) {
        const out = createInstanceBuffer();
        const arming: ArmingState = { ...initialArming(), phase, intent: 5, x: 2, y: 3 };
        intentInstances({ p, arming, selected: 0, driven: [0], ui, tickF: 100.5, pxPerUnit }, out);
        expect(out.count).toBeGreaterThan(0);
        const data = out.data();
        expect(data.length).toBe(out.count * INSTANCE_FLOATS);
        expect(data.every(Number.isFinite)).toBe(true);
      }
    }
  });
});
