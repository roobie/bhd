// lit-html fragments for bargains: the offer panel, the hero-card pips and the help section.
// Owner: w9-hud. Called by hud.ts inside its template, so these return TemplateResults.
// Every word comes from the model (generated from effect values in content/help.ts); nothing here
// knows a bargain by id (D-KODXIPZFM5CSHCQ2).

import { html, nothing, type TemplateResult } from 'lit-html';
import { styleMap } from 'lit-html/directives/style-map.js';
import { UI_TEXT } from '../../content/presentation.ts';
import type {
  BargainCardModel,
  BargainHudModel,
  BargainOfferModel,
  BargainPipModel,
  HelpBargainsModel,
  UiAction,
} from './types.ts';

type Dispatch = (action: UiAction) => void;

function lineList(lines: readonly string[], cls: string, mark: string): TemplateResult {
  return html`<ul class="bline ${cls}">${lines.map((l) => html`<li><b aria-hidden="true">${mark}</b> ${l}</li>`)}</ul>`;
}

function cardView(o: BargainOfferModel, c: BargainCardModel, dispatch: Dispatch): TemplateResult {
  const locked = o.inFlight || !o.enabled;
  const cls = `bcard${c.chosen ? ' chosen' : ''}${o.inFlight && !c.chosen ? ' passed' : ''}`;
  return html`<button
    class=${cls}
    type="button"
    ?disabled=${locked}
    data-card=${c.id}
    aria-label="Take ${c.label} (${c.hotkey})"
    style=${styleMap({ '--c': c.color })}
    @click=${() => dispatch({ kind: 'bargain', offer: o.offer, card: c.id })}
  >
    <span class="bhead"><span class="bname">${c.label}</span><small class="key">${c.hotkey}</small></span>
    <small class="bwho">For: ${c.who}</small>
    ${lineList(c.gains, 'gain', '+')}
    ${lineList(c.costs, 'cost', '-')}
  </button>`;
}

function offerStatus(o: BargainOfferModel): string {
  if (!o.inFlight) {
    return `${o.secondsLeft}s`;
  }
  return o.declined ? 'declined, waiting' : 'chosen, waiting';
}

function offerView(o: BargainOfferModel, dispatch: Dispatch, expanded: boolean): TemplateResult {
  const locked = o.inFlight || !o.enabled;
  const status = offerStatus(o);
  return html`<details class="bargain-offer ${o.inFlight ? 'inflight' : ''}" data-offer=${o.offer} ?open=${expanded}>
    <summary class="bsummary" aria-label="Bargain offer, wave ${o.wave}, ${status}">
      <span class="btitle">Bargain offer</span>
      <span class="btime" role="timer">${status}</span>
      <span class="bbar" aria-hidden="true"><i style=${styleMap({ width: `${(o.frac * 100).toFixed(1)}%` })}></i></span>
    </summary>
    <div class="bcards">
      ${o.cards.map((c) => cardView(o, c, dispatch))}
      <button
        class="bcard decline${o.declined ? ' chosen' : ''}"
        type="button"
        ?disabled=${locked}
        aria-label="${UI_TEXT.bargain.decline} (${o.declineKey})"
        @click=${() => dispatch({ kind: 'bargain', offer: o.offer })}
      >
        <span class="bhead"><span class="bname">${UI_TEXT.bargain.decline}</span><small class="key">${o.declineKey}</small></span>
        ${o.declineReward === '' ? nothing : html`<small class="reward">${o.declineReward}</small>`}
      </button>
    </div>
  </details>`;
}

/**
 * The open offers. `expanded` sets whether a fresh panel starts open (wide screens); a player's own
 * toggle of the `<details>` survives re-renders because the bound value does not change. The panel
 * is data-hit, so taps on it never reach the map.
 */
export function bargainPanelView(model: BargainHudModel, dispatch: Dispatch, expanded: boolean): TemplateResult {
  return html`<div class="bargains" data-hit role="region" aria-label="Bargain offers">
    ${model.offers.map((o) => offerView(o, dispatch, expanded))}
  </div>`;
}

/** The pips on a hero card; the tooltip lists the bargain's gains and costs. */
export function bargainPipsView(pips: readonly BargainPipModel[]): TemplateResult | typeof nothing {
  if (pips.length === 0) {
    return nothing;
  }
  return html`<span class="bpips">${pips.map(
    (b) =>
      html`<span class="bpip" role="img" aria-label=${b.tooltip.replaceAll('\n', ', ')} title=${b.tooltip} style=${styleMap({ '--c': b.color })}>${b.glyph}</span>`,
  )}</span>`;
}

/** The help overlay's Bargains section: the rules, then what was accepted so far. */
export function helpBargainsView(h: HelpBargainsModel): TemplateResult {
  return html`<h2>Bargains</h2>
    <dl class="notes">${h.notes.map(([title, text]) => html`<dt>${title}</dt><dd>${text}</dd>`)}</dl>
    ${
      h.taken.length === 0
        ? nothing
        : html`<ul class="legend">${h.taken.map(
            (t) => html`<li class="helptaken"><b>${t.label}</b> <small>${t.who}</small>
              ${lineList(t.gains, 'gain', '+')}${lineList(t.costs, 'cost', '-')}</li>`,
          )}</ul>`
    }`;
}
