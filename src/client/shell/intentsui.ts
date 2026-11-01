// lit-html fragments for arming: the fire-time picker and the live intents list. Owner: w7-arming.
// STUB from the contracts slice: signatures are final, bodies are not written. Called by hud.ts
// (w7-hud) inside its template, so these return TemplateResults rather than mounting themselves.

import type { TemplateResult } from 'lit-html';
import type { ArmPickerModel, IntentRowModel, UiAction } from './types.ts';

/**
 * The picker: seconds readout with +/- chips (`fireTime` +/-1 half second, bounded by the model's
 * min and max), a confirm chip (`armConfirm`) in `fire` mode, a cancel chip (`cancel`). In
 * `reserve` mode the +/- chips send `reserveOffset`, and there is no confirm (the next ability
 * button reserves).
 */
export function armPickerView(_model: ArmPickerModel, _dispatch: (action: UiAction) => void): TemplateResult {
  throw new Error('not implemented');
}

/**
 * The compact live-intents list: a row per intent (glyph, label, countdown, reserver swatches);
 * tapping a row dispatches `pickIntent` (when `canReserve`), and the cancel mark (when `canCancel`)
 * dispatches `cancelIntent`.
 */
export function intentsListView(
  _rows: readonly IntentRowModel[],
  _dispatch: (action: UiAction) => void,
): TemplateResult {
  throw new Error('not implemented');
}
