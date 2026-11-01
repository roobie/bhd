// lit-html fragments for arming: the fire-time picker and the live intents list. Owner: w7-arming.
// Called by hud.ts (w7-hud) inside its template, so these return TemplateResults rather than
// mounting themselves.

import { html, type TemplateResult } from 'lit-html';
import type { ArmPickerModel, IntentRowModel, UiAction } from './types.ts';

type Dispatch = (action: UiAction) => void;

function formatSeconds(s: number): string {
  return `${s.toFixed(1)} s`;
}

/**
 * The picker: seconds readout with +/- chips (`fireTime` +/-1 half second, bounded by the model's
 * min and max), a confirm chip (`armConfirm`) in `fire` mode, a cancel chip (`cancel`). In
 * `reserve` mode the +/- chips send `reserveOffset`, and there is no confirm (the next ability
 * button reserves).
 */
export function armPickerView(model: ArmPickerModel, dispatch: Dispatch): TemplateResult {
  const fire = model.mode === 'fire';
  const kind = fire ? 'fireTime' : 'reserveOffset';
  const atMin = model.seconds <= (fire ? model.minSeconds : 0);
  const atMax = model.seconds >= model.maxSeconds;
  const confirm = fire
    ? html`<button class="chip confirm" type="button" aria-label="arm" @click=${() => dispatch({ kind: 'armConfirm' })}>arm</button>`
    : html`<span class="arm-hint">press an ability to reserve</span>`;
  return html`<div class="arm-picker" data-mode=${model.mode}>
    <span class="arm-label">${fire ? 'fires in' : 'after fire'}</span>
    <button class="chip" type="button" aria-label="shorter" ?disabled=${atMin}
      @click=${() => dispatch({ kind, halfSeconds: -1 })}>-</button>
    <span class="arm-seconds">${formatSeconds(model.seconds)}</span>
    <button class="chip" type="button" aria-label="longer" ?disabled=${atMax}
      @click=${() => dispatch({ kind, halfSeconds: 1 })}>+</button>
    ${confirm}
    <button class="chip cancel" type="button" aria-label="cancel" @click=${() => dispatch({ kind: 'cancel' })}>✕</button>
  </div>`;
}

function rowView(row: IntentRowModel, dispatch: Dispatch): TemplateResult {
  const classes = ['intent-row', row.selected ? 'selected' : '', row.fired ? 'fired' : '', row.mine ? 'mine' : '']
    .filter((c) => c !== '')
    .join(' ');
  const pick = (): void => {
    if (row.canReserve) {
      dispatch({ kind: 'pickIntent', id: row.id });
    }
  };
  const cancel = row.canCancel
    ? html`<button class="chip cancel" type="button" aria-label="cancel trigger"
        @click=${() => dispatch({ kind: 'cancelIntent', id: row.id })}>✕</button>`
    : '';
  return html`<li class=${classes} data-intent=${row.id}>
    <button class="intent-main" type="button" ?disabled=${!row.canReserve} @click=${pick}>
      <span class="intent-glyph">${row.glyph}</span>
      <span class="intent-label">${row.label}</span>
      <span class="intent-time">${row.fired ? 'fired' : formatSeconds(row.secondsLeft)}</span>
      ${row.reserved ? html`<span class="intent-you">reserved</span>` : ''}
      <span class="intent-pips">${row.reservers.map((c) => html`<i class="pip" style="background:${c}"></i>`)}</span>
    </button>
    ${cancel}
  </li>`;
}

/**
 * The compact live-intents list: a row per intent (glyph, label, countdown, reserver swatches);
 * tapping a row dispatches `pickIntent` (when `canReserve`), and the cancel mark (when `canCancel`)
 * dispatches `cancelIntent`.
 */
export function intentsListView(rows: readonly IntentRowModel[], dispatch: Dispatch): TemplateResult {
  return html`<ul class="intents-list">${rows.map((r) => rowView(r, dispatch))}</ul>`;
}
