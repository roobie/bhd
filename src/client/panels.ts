// Bot and Director panels for the debug viewer. Read-only; render gracefully when lists are empty.

import { html, svg } from 'lit-html';
import type { Match } from '../match/match.ts';
import { phaseColor } from './colors.ts';
import { scoreBars, secondsText, sparkPoints } from './panelmath.ts';

const SPARK_W = 160;
const SPARK_H = 32;

function decisionRow(
  d: {
    readonly id: string;
    readonly options: readonly { id: string; score: number }[];
    readonly picked: string;
    readonly since: number;
  },
  tick: number,
) {
  return html`<div class="decision">
    <div class="dhead"><b>${d.id}</b>: ${d.picked} <span class="dim">changed ${secondsText(tick - d.since)} ago</span></div>
    ${scoreBars(d.options, d.picked).map(
      (
        b,
      ) => html`<div class="bar${b.picked ? ' picked' : ''}${b.negative ? ' neg' : ''}" title="${b.id} ${b.score.toFixed(3)}">
        <span class="bid">${b.id}</span>
        <span class="track"><i style="width:${(b.frac * 100).toFixed(0)}%"></i></span>
        <span class="bval">${b.score.toFixed(2)}</span>
      </div>`,
    )}
  </div>`;
}

export function botPanel(match: Match) {
  const { tick } = match.sim;
  const { seats } = match;
  return html`<section class="panel bots" aria-label="bot panel">
    <h2>bots</h2>
    ${seats.length === 0 ? html`<div class="dim">no seats</div>` : ''}
    ${seats.map(
      (s) => html`<div class="seat">
        <h3>${match.sim.game.heroes[s.slot]?.id ?? `slot ${s.slot}`} <span class="dim">${s.doctrine}</span></h3>
        ${s.decisions.length === 0 ? html`<div class="dim">no decisions yet</div>` : ''}
        ${s.decisions.map((d) => decisionRow(d, tick))}
      </div>`,
    )}
  </section>`;
}

/** Tension sparkline as inline SVG; `history` holds tension samples within 0..1. */
function spark(history: readonly number[]) {
  return html`<svg class="spark" width=${SPARK_W} height=${SPARK_H} viewBox="0 0 ${SPARK_W} ${SPARK_H}" role="img" aria-label="tension history">
    ${svg`<polyline fill="none" stroke="currentColor" stroke-width="1.5" points=${sparkPoints(history, SPARK_W, SPARK_H)}></polyline>`}
  </svg>`;
}

export function directorPanel(match: Match, history: readonly number[]) {
  const status = match.directorStatus;
  const master = match.masterView;
  const { tick } = match.sim;
  if (status === undefined || master === undefined) {
    return html`<section class="panel director" aria-label="director panel">
      <h2>director</h2>
      <div class="dim">schedule mode: no Director</div>
    </section>`;
  }
  const sendIn = master.sendAt - tick;
  return html`<section class="panel director" aria-label="director panel">
    <h2>director</h2>
    <div>
      tension <b>${status.tension.toFixed(2)}</b>
      <span class="phase" style="color:${phaseColor(status.phase)}">${status.phase}</span>
    </div>
    ${spark(history)}
    <div>budget <b>${master.budget}</b> · waves left ${master.wavesLeft}</div>
    <div>pending: ${master.pending.length === 0 ? html`<span class="dim">empty</span>` : master.pending.map((g) => `${g.def}×${g.count}`).join(', ')}</div>
    <div>send: ${sendIn > 0 ? `locked ${secondsText(sendIn)}` : 'open'} · next wave in ${secondsText(master.nextAt - tick)}</div>
  </section>`;
}
