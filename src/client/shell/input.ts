// DOM adapter: pointer and keyboard events -> UiAction. Owner: w7-input.
// STUB from the contracts slice: signatures are final, bodies are not written.
//
// Pointer Events only; the canvas has `touch-action: none`. Picking uses `Camera.screenToWorld` and
// the nearest entity within its radius plus a slop of 8 px (mouse) or 22 px (touch). Touch also
// accepts drag-from-button-onto-map, which the HUD (hud.ts) turns into `castAt`.

import type { Camera, ControlState, EntitySnap, UiAction, Vec2 } from './types.ts';

/** Ability hotkeys by slot: Q W E R. */
export const ABILITY_KEYS: readonly string[] = ['q', 'w', 'e', 'r'];

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
 * H hold; P and Space pause; Escape cancel; Enter armConfirm; '+' / '-' fireTime. Undefined for any
 * other key.
 */
export function keyAction(_e: KeyInput, _state: ControlState): UiAction | undefined {
  return undefined;
}

/**
 * The entity under a world point: the nearest whose distance to its centre is within
 * `radius + slopWorld`, ties broken by lower id; undefined when none.
 */
export function pickEntity(_entities: readonly EntitySnap[], _at: Vec2, _slopWorld: number): EntitySnap | undefined {
  return undefined;
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

/** Attaches canvas pointer handlers and window key handlers; returns the function that removes them. */
export function attachInput(_deps: InputDeps): () => void {
  throw new Error('not implemented');
}
