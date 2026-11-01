// Control reducer, keymap and picking invariants: command shapes and validity, driven-only output,
// refusals. No gameplay numbers (D-4E4QRJ7N6LIGZDSD).

import { describe, expect, it } from 'vitest';
import { initialControls, reduce } from '../../../src/client/shell/controls.ts';
import { attachInput, keyAction, pickEntity } from '../../../src/client/shell/input.ts';
import type { ControlContext, EntitySnap, UiAction } from '../../../src/client/shell/types.ts';
import { defaultGame } from '../../../src/content/index.ts';
import { defaultPerception } from '../../../src/content/perception.ts';
import type { Presentation } from '../../../src/content/presentation.ts';
import { createMemory } from '../../../src/perception/memory.ts';
import { perceive } from '../../../src/perception/perceive.ts';
import type { Perception } from '../../../src/perception/types.ts';
import type { Command } from '../../../src/sim/commands.ts';
import { isValidCommand } from '../../../src/sim/commands.ts';
import { Sim } from '../../../src/sim/sim.ts';

const base = perceive(new Sim({ seed: 1, game: defaultGame() }), createMemory(defaultPerception()));
const [hero0, hero1] = base.heroes;
if (hero0 === undefined || hero1 === undefined) {
  throw new Error('expected heroes in slots 0 and 1');
}

/** Ability slots 0-3 get targeting instant, direction, point, unit via a synthetic presentation. */
function ctxWith(driven: readonly number[], patch?: (p: Perception) => Perception): ControlContext {
  const p = patch ? patch(base) : base;
  const modes = ['instant', 'direction', 'point', 'unit'] as const;
  const abilities = p.heroes.flatMap((h) =>
    h.abilities.map((a) => ({
      effect: a.effect,
      label: a.effect,
      glyph: a.effect.slice(0, 2),
      targeting: modes[a.slot % 4] ?? 'instant',
      armable: false,
    })),
  );
  const ui: Presentation = { abilities, resources: [], statuses: [], heroes: [], enemies: [] };
  return { p, driven, ui, maxOffsetSeconds: 5 };
}

function withAbilities(patch: (a: Perception['heroes'][number]['abilities'][number]) => object) {
  return (p: Perception): Perception => ({
    ...p,
    heroes: p.heroes.map((h) => ({ ...h, abilities: h.abilities.map((a) => ({ ...a, ...patch(a) })) })),
  });
}

function run(actions: readonly UiAction[], ctx: ControlContext) {
  let state = initialControls(0);
  const commands: Command[] = [];
  for (const a of actions) {
    const r = reduce(state, a, ctx);
    ({ state } = r);
    commands.push(...r.commands);
  }
  return { state, commands };
}

describe('reduce', () => {
  const ctx = ctxWith([0]);
  const ready = ctxWith(
    [0],
    withAbilities(() => ({ ready: true })),
  );

  it('moves the selected driven hero on primary and secondary', () => {
    const r = run(
      [
        { kind: 'primary', x: 10, y: 20 },
        { kind: 'secondary', x: 30, y: 40 },
      ],
      ctx,
    );
    expect(r.commands).toEqual([
      { kind: 'move', hero: hero0.id, x: 10, y: 20 },
      { kind: 'move', hero: hero0.id, x: 30, y: 40 },
    ]);
  });

  it('moves toward the position of a picked enemy', () => {
    const [template] = base.enemies;
    const enemyCtx = ctxWith([0], (p) => ({
      ...p,
      enemies: template ? [{ ...template, id: 99_999, x: 7, y: 8 }] : [],
    }));
    const r = run([{ kind: 'primary', x: 0, y: 0, unit: 99_999 }], enemyCtx);
    // Without an enemy in the template the pick falls back to the clicked point.
    expect(r.commands).toEqual([{ kind: 'move', hero: hero0.id, x: template ? 7 : 0, y: template ? 8 : 0 }]);
  });

  it('emits nothing for bot-driven slots, and select never emits', () => {
    const r = run(
      [
        { kind: 'primary', x: 1, y: 1 },
        { kind: 'cast', slot: 0 },
        { kind: 'stop' },
        { kind: 'hold' },
        { kind: 'autocast', slot: 0 },
        { kind: 'select', slot: 1 },
      ],
      ctxWith([]),
    );
    expect(r.commands).toEqual([]);
    expect(r.state.selected).toBe(1);
  });

  it('emits nothing for a driven hero that is dead', () => {
    const dead = ctxWith([0], (p) => ({ ...p, heroes: p.heroes.filter((h) => h.slot !== 0) }));
    expect(run([{ kind: 'primary', x: 1, y: 1 }, { kind: 'stop' }], dead).commands).toEqual([]);
  });

  it('casts instant abilities at once and aims the others, confirming with the right fields', () => {
    expect(run([{ kind: 'cast', slot: 0 }], ready).commands).toEqual([{ kind: 'ability', hero: hero0.id, slot: 0 }]);

    const dir = run([{ kind: 'cast', slot: 1 }], ready);
    expect(dir.commands).toEqual([]);
    expect(dir.state.aim).toEqual({ slot: 1, targeting: 'direction' });
    const dirOk = run(
      [
        { kind: 'cast', slot: 1 },
        { kind: 'primary', x: 5, y: 6 },
      ],
      ready,
    );
    expect(dirOk.commands).toEqual([{ kind: 'ability', hero: hero0.id, slot: 1, x: 5, y: 6 }]);
    expect(dirOk.state.aim).toBeUndefined();

    const unitNone = run([{ kind: 'castAt', slot: 3, x: 5, y: 6 }], ready);
    expect(unitNone.commands).toEqual([{ kind: 'ability', hero: hero0.id, slot: 3 }]);
    const unitHit = run([{ kind: 'castAt', slot: 3, x: 5, y: 6, unit: 42 }], ready);
    expect(unitHit.commands).toEqual([{ kind: 'ability', hero: hero0.id, slot: 3, target: 42 }]);
  });

  it('cancels an aim by pressing the slot again, secondary, or cancel', () => {
    const seconds: UiAction[] = [{ kind: 'cast', slot: 2 }, { kind: 'secondary', x: 1, y: 1 }, { kind: 'cancel' }];
    for (const second of seconds) {
      const r = run([{ kind: 'cast', slot: 2 }, second], ready);
      expect(r.state.aim).toBeUndefined();
      expect(r.commands).toEqual([]);
    }
  });

  it('gives a hint and no command for an ability on cooldown', () => {
    const cooling = ctxWith(
      [0],
      withAbilities(() => ({ ready: false })),
    );
    const r = run([{ kind: 'cast', slot: 0 }], cooling);
    expect(r.commands).toEqual([]);
    expect(r.state.hint?.text).toBeTruthy();
    expect(r.state.hint?.untilTick).toBeGreaterThan(base.tick);
  });

  it('ignores a cast of a slot the hero lacks', () => {
    const none = ctxWith([0], (p) => ({ ...p, heroes: p.heroes.map((h) => ({ ...h, abilities: [] })) }));
    const r = run([{ kind: 'cast', slot: 3 }], none);
    expect(r.commands).toEqual([]);
    expect(r.state.aim).toBeUndefined();
  });

  it('toggles autocast and hold from the current perception', () => {
    const on = ctxWith([0], (p) => ({ ...p, heroes: p.heroes.map((h) => ({ ...h, autocast: 0b10, hold: true })) }));
    const r = run(
      [{ kind: 'autocast', slot: 1 }, { kind: 'autocast', slot: 0 }, { kind: 'hold' }, { kind: 'stop' }],
      on,
    );
    expect(r.commands).toEqual([
      { kind: 'autocast', hero: hero0.id, slot: 1, on: false },
      { kind: 'autocast', hero: hero0.id, slot: 0, on: true },
      { kind: 'hold', hero: hero0.id, on: false },
      { kind: 'stop', hero: hero0.id },
    ]);
  });

  it('tracks hover and pause, ignores restart, and every command is valid', () => {
    const r = run([{ kind: 'hover', x: 3, y: 4 }, { kind: 'pause' }, { kind: 'restart' }], ctx);
    expect(r.state.cursor).toEqual({ x: 3, y: 4 });
    expect(r.state.paused).toBe(true);
    expect(r.commands).toEqual([]);
    const all = run(
      [
        { kind: 'primary', x: 1, y: 2 },
        { kind: 'stop' },
        { kind: 'hold' },
        { kind: 'autocast', slot: 2 },
        { kind: 'cast', slot: 0 },
      ],
      ready,
    );
    expect(all.commands.length).toBeGreaterThan(0);
    for (const c of all.commands) {
      expect(isValidCommand(c)).toBe(true);
    }
  });

  it('tapping a bot-driven hero moves to it and keeps the selection', () => {
    const r = run([{ kind: 'primary', x: 0, y: 0, unit: hero1.id }], ctxWith([0]));
    expect(r.state.selected).toBe(0);
    expect(r.commands).toHaveLength(1);
    expect(r.commands[0]).toMatchObject({ kind: 'move' });
  });

  it('tapping an allied hero selects it without a command', () => {
    const r = run([{ kind: 'primary', x: 0, y: 0, unit: hero1.id }], ctxWith([0, hero1.slot]));
    expect(r.state.selected).toBe(hero1.slot);
    expect(r.commands).toEqual([]);
  });
});

describe('help toggle', () => {
  const ctx = ctxWith([0]);

  it('H toggles help without commands, pausing or touching the selection', () => {
    const open = reduce(initialControls(0), { kind: 'help' }, ctx);
    expect(open.state.help).toBe(true);
    expect(open.state.paused).toBe(false);
    expect(open.commands).toEqual([]);
    expect(reduce(open.state, { kind: 'help' }, ctx).state.help).toBe(false);
  });

  it('Escape closes help first and leaves an aim alone', () => {
    const aiming = { ...initialControls(0), aim: { slot: 1, targeting: 'direction' as const }, help: true };
    const closed = reduce(aiming, { kind: 'cancel' }, ctx);
    expect(closed.state.help).toBe(false);
    expect(closed.state.aim).toBeDefined();
    expect(reduce(closed.state, { kind: 'cancel' }, ctx).state.aim).toBeUndefined();
  });
});

describe('keyAction', () => {
  const s = initialControls(0);
  const k = (key: string, mods: { ctrl?: boolean; alt?: boolean } = {}) =>
    keyAction({ key, ctrl: mods.ctrl ?? false, alt: mods.alt ?? false, shift: false }, s);

  it('maps the keys', () => {
    expect(k('2')).toEqual({ kind: 'select', slot: 1 });
    expect(k('Q')).toEqual({ kind: 'cast', slot: 0 });
    expect(k('r')).toEqual({ kind: 'cast', slot: 3 });
    expect(k('w', { ctrl: true })).toEqual({ kind: 'autocast', slot: 1 });
    expect(k('e', { alt: true })).toEqual({ kind: 'cast', slot: 2, arm: true });
    expect(k('s')).toEqual({ kind: 'stop' });
    expect(k('f')).toEqual({ kind: 'hold' });
    expect(k('h')).toEqual({ kind: 'help' });
    expect(k('p')).toEqual({ kind: 'pause' });
    expect(k(' ')).toEqual({ kind: 'pause' });
    expect(k('Escape')).toEqual({ kind: 'cancel' });
    expect(k('Enter')).toEqual({ kind: 'armConfirm' });
    expect(k('+')).toEqual({ kind: 'fireTime', halfSeconds: 1 });
    expect(k('-')).toEqual({ kind: 'fireTime', halfSeconds: -1 });
  });

  it('leaves other keys and browser shortcuts alone', () => {
    expect(k('z')).toBeUndefined();
    expect(k('5')).toBeUndefined();
    expect(k('F5')).toBeUndefined();
    expect(k('s', { ctrl: true })).toBeUndefined();
  });
});

describe('pickEntity', () => {
  const e = (id: number, x: number, y: number, radius = 1): EntitySnap => ({
    id,
    kind: 'enemy',
    def: 'x',
    team: 1,
    x,
    y,
    radius,
    hpFrac: 1,
    facing: 0,
    statuses: [],
  });

  it('picks within radius plus slop, nearest first, lower id on ties', () => {
    const list = [e(2, 0, 0), e(1, 10, 0), e(3, 3, 0)];
    expect(pickEntity(list, { x: 0.5, y: 0 }, 0)?.id).toBe(2);
    expect(pickEntity(list, { x: 1.8, y: 0 }, 0)).toBeUndefined();
    expect(pickEntity(list, { x: 1.8, y: 0 }, 2)?.id).toBe(3);
    expect(pickEntity([e(5, 1, 0), e(4, -1, 0)], { x: 0, y: 0 }, 0)?.id).toBe(4);
    expect(pickEntity([], { x: 0, y: 0 }, 5)).toBeUndefined();
  });
});

describe('attachInput', () => {
  it('dispatches from pointer events and detaches', () => {
    const handlers = new Map<string, (e: never) => void>();
    const target = {
      addEventListener: (t: string, h: (e: never) => void) => handlers.set(t, h),
      removeEventListener: (t: string) => handlers.delete(t),
      getBoundingClientRect: () => ({ left: 10, top: 20 }),
    };
    const g = globalThis as unknown as { addEventListener?: unknown; removeEventListener?: unknown };
    const prev = { add: g.addEventListener, remove: g.removeEventListener };
    g.addEventListener = target.addEventListener;
    g.removeEventListener = target.removeEventListener;
    const got: UiAction[] = [];
    const camera = {
      pxPerUnit: 2,
      isMapPoint: () => true,
      screenToWorld: (p: { x: number; y: number }) => ({ x: p.x / 2, y: p.y / 2 }),
    };
    const off = attachInput({
      canvas: target as unknown as HTMLCanvasElement,
      camera: () => camera as never,
      entities: () => [],
      state: () => initialControls(0),
      dispatch: (a) => got.push(a),
    });
    try {
      const down = { pointerType: 'mouse', button: 0, clientX: 30, clientY: 60, preventDefault: () => undefined };
      handlers.get('pointerdown')?.(down as never);
      expect(got).toEqual([{ kind: 'primary', x: 10, y: 20 }]);
    } finally {
      off();
      g.addEventListener = prev.add;
      g.removeEventListener = prev.remove;
    }
    expect(handlers.has('keydown')).toBe(false);
  });
});
