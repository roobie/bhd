// DOM adapter: pointer and keyboard events -> UiAction. Owner: w7-input.
//
// Pointer Events only; the canvas has `touch-action: none`. Picking uses `Camera.screenToWorld` and
// the nearest entity within its radius plus a slop of 8 px (mouse) or 22 px (touch). Touch also
// accepts drag-from-button-onto-map, which the HUD (hud.ts) turns into `castAt`.

import type { Camera, ControlState, EntitySnap, UiAction, Vec2 } from './types.ts';

/** Ability hotkeys by slot: Q W E R. */
const ABILITY_KEYS: readonly string[] = ['q', 'w', 'e', 'r'];

/** Keys of the non-ability buttons. */
export const KEY_STOP = 'S';
export const KEY_HOLD = 'F';

/** Non-ability keys for the help panel's "Keys" row, in the order they read. Keep in step with `keyAction`. */
export const KEY_HELP: readonly { readonly keys: string; readonly does: string }[] = [
  { keys: '1-4', does: 'select hero' },
  { keys: KEY_STOP, does: 'stop' },
  { keys: KEY_HOLD, does: 'hold fire' },
  { keys: 'Alt+Q/W/E/R', does: 'arm ability' },
  { keys: 'Ctrl+Q/W/E/R', does: 'autocast' },
  { keys: 'Enter', does: 'confirm arm' },
  { keys: '+ -', does: 'fire time' },
  { keys: 'P, Space', does: 'pause' },
  { keys: 'H', does: 'help' },
  { keys: 'Esc', does: 'cancel' },
];

/** The parts of a KeyboardEvent the keymap reads. */
export interface KeyInput {
  /** `KeyboardEvent.key`, any case. */
  readonly key: string;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

/**
 * The keymap, pure: 1-4 select; Q/W/E/R cast slot 0-3 (Ctrl: autocast; Alt: `cast` with `arm: true`); S stop;
 * F hold fire; H help; P and Space pause; Escape cancel; Enter armConfirm; '+' / '-' fireTime. Undefined for any
 * other key.
 */
export function keyAction(e: KeyInput, _state: ControlState): UiAction | undefined {
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const slot = ABILITY_KEYS.indexOf(key);
  if (slot >= 0) {
    if (e.ctrl) {
      return { kind: 'autocast', slot };
    }
    return e.alt ? { kind: 'cast', slot, arm: true } : { kind: 'cast', slot };
  }
  if (e.ctrl || e.alt) {
    return undefined;
  }
  if (key >= '1' && key <= '4') {
    return { kind: 'select', slot: Number(key) - 1 };
  }
  switch (key) {
    case 's':
      return { kind: 'stop' };
    case 'f':
      return { kind: 'hold' };
    case 'h':
      return { kind: 'help' };
    case 'p':
    case ' ':
      return { kind: 'pause' };
    case 'Escape':
      return { kind: 'cancel' };
    case 'Enter':
      return { kind: 'armConfirm' };
    case '+':
    case '=':
      return { kind: 'fireTime', halfSeconds: 1 };
    case '-':
      return { kind: 'fireTime', halfSeconds: -1 };
    default:
      return undefined;
  }
}

/**
 * The entity under a world point: the nearest whose distance to its centre is within
 * `radius + slopWorld`, ties broken by lower id; undefined when none.
 */
export function pickEntity(entities: readonly EntitySnap[], at: Vec2, slopWorld: number): EntitySnap | undefined {
  let best: EntitySnap | undefined;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const e of entities) {
    const d = Math.hypot(e.x - at.x, e.y - at.y);
    if (d > e.radius + slopWorld) {
      continue;
    }
    if (d < bestDist || (d === bestDist && best !== undefined && e.id < best.id)) {
      best = e;
      bestDist = d;
    }
  }
  return best;
}

export interface InputDeps {
  readonly canvas: HTMLCanvasElement;
  /** Current camera (changes on resize). */
  readonly camera: () => Camera;
  /** Current drawn entities for picking. */
  readonly entities: () => readonly EntitySnap[];
  readonly state: () => ControlState;
  readonly dispatch: (action: UiAction) => void;
}

const MOUSE_SLOP_PX = 8;
const TOUCH_SLOP_PX = 22;

/** Attaches canvas pointer handlers and window key handlers; returns the function that removes them. */
export function attachInput(deps: InputDeps): () => void {
  const { canvas, dispatch } = deps;

  const worldOf = (e: PointerEvent): Vec2 => {
    const rect = canvas.getBoundingClientRect();
    return deps.camera().screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const pickAt = (e: PointerEvent, at: Vec2): number | undefined => {
    const slopPx = e.pointerType === 'mouse' ? MOUSE_SLOP_PX : TOUCH_SLOP_PX;
    return pickEntity(deps.entities(), at, slopPx / deps.camera().pxPerUnit)?.id;
  };
  const onMap = (e: PointerEvent): boolean => {
    const rect = canvas.getBoundingClientRect();
    return deps.camera().isMapPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const primary = (e: PointerEvent): void => {
    if (!onMap(e)) {
      return;
    }
    const at = worldOf(e);
    const unit = pickAt(e, at);
    dispatch(unit === undefined ? { kind: 'primary', ...at } : { kind: 'primary', ...at, unit });
  };

  const onDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (e.pointerType !== 'mouse') {
      // Touch confirms on release, so a finger can drag the aim preview first.
      canvas.setPointerCapture?.(e.pointerId);
      const at = worldOf(e);
      dispatch({ kind: 'hover', ...at });
      return;
    }
    if (e.button === 0) {
      primary(e);
    } else if (e.button === 2 && onMap(e)) {
      dispatch({ kind: 'secondary', ...worldOf(e) });
    }
  };
  const onMove = (e: PointerEvent): void => {
    dispatch({ kind: 'hover', ...worldOf(e) });
  };
  const onUp = (e: PointerEvent): void => {
    if (e.pointerType !== 'mouse') {
      e.preventDefault();
      primary(e);
    }
  };
  const onContext = (e: Event): void => {
    e.preventDefault();
  };
  const onKey = (e: KeyboardEvent): void => {
    const target = e.target as { tagName?: string } | null;
    if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && (target?.tagName === 'BUTTON' || target?.tagName === 'A')) {
      // A focused button or link takes Enter and Space itself.
      return;
    }
    const action = keyAction({ key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey }, deps.state());
    if (action === undefined || (e.repeat && action.kind !== 'fireTime')) {
      return;
    }
    e.preventDefault();
    dispatch(action);
  };

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('contextmenu', onContext);
  globalThis.addEventListener('keydown', onKey);
  return () => {
    canvas.removeEventListener('pointerdown', onDown);
    canvas.removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerup', onUp);
    canvas.removeEventListener('contextmenu', onContext);
    globalThis.removeEventListener('keydown', onKey);
  };
}
