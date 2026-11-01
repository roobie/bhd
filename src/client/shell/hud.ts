// The lit-html HUD over the canvas, rendered from a HudModel. Owner: w7-hud.
// STUB from the contracts slice: signatures are final, bodies are not written.
// Styles live in hud.css (imported here); the layout must not overlap the free map area that
// `hudInsets` (hudmodel.ts) leaves, at 390x844 and 1280x720.

import type { Hud, HudDeps } from './types.ts';
import './hud.css';

/**
 * Mounts the HUD into `root` (top bar, 4 hero cards, ability bar, intents list via intentsui.ts,
 * end overlay). Buttons dispatch `UiAction`s through `deps`; a long press (500 ms) on an ability
 * button dispatches `autocast`; a drag from a button released over the map dispatches `castAt`
 * with `deps.screenToWorld`. Re-render only changes DOM that changed (lit-html).
 */
export function createHud(_root: HTMLElement, _deps: HudDeps): Hud {
  throw new Error('not implemented');
}
