// Debug viewer app: read-only. Runs a live Sim, steps it from requestAnimationFrame at TICK_HZ x
// speed, draws it, and shows a HUD. Sends no commands. NOT the game client (wave 7).

import { html, render } from 'lit-html';
import { defaultGame } from '../content/index.ts';
import { Sim } from '../sim/sim.ts';
import { TICK_HZ } from '../sim/time.ts';
import { drawSim, readPalette } from './draw.ts';
import type { NameBook } from './eventlog.ts';
import { pushEvents } from './eventlog.ts';
import { ancientText, countsText, gunnerHud } from './hud.ts';

const SPEEDS = [0.5, 1, 2, 4, 8] as const;
const LOG_LINES = 20;
/** Cap on ticks per frame, so a slow frame cannot snowball. */
const MAX_STEPS_PER_FRAME = 240;

export function mount(root: HTMLElement): void {
  let seed = 1;
  let sim = new Sim({ seed, game: defaultGame() });
  let names: NameBook = new Map();
  let log: string[] = [];
  let playing = true;
  let speed = 1;
  let acc = 0;
  let last: number | undefined;

  function stepOnce(): void {
    pushEvents(log, names, sim.step(), LOG_LINES);
  }

  function reset(): void {
    sim = new Sim({ seed, game: defaultGame() });
    names = new Map();
    log = [];
    acc = 0;
    // Setup events (spawns) are returned by the first step; run it so names are known.
    stepOnce();
  }

  function togglePlay(): void {
    playing = !playing;
  }

  function stepButton(): void {
    playing = false;
    stepOnce();
  }

  function setSeed(ev: Event): void {
    seed = Number((ev.target as HTMLInputElement).value) >>> 0;
    reset();
  }

  function speedButton(s: number) {
    const pick = (): void => {
      speed = s;
    };
    return html`<button type="button" class=${s === speed ? 'on' : ''} aria-pressed=${s === speed} @click=${pick}>${s}×</button>`;
  }

  function view() {
    const result = sim.ended ? (log.findLast((l) => l.includes('game over')) ?? 'ended') : 'running';
    return html`
      <h1>BHD debug viewer</h1>
      <p class="note">debug viewer — not the game client (wave 7). Read-only.</p>
      <div class="controls">
        <button type="button" @click=${togglePlay}>${playing ? 'Pause' : 'Play'}</button>
        <button type="button" @click=${stepButton}>Step</button>
        ${SPEEDS.map(speedButton)}
        <button type="button" @click=${reset}>Reset</button>
        <label>seed <input type="number" min="0" step="1" .value=${String(seed)} @change=${setSeed} /></label>
      </div>
      <canvas aria-label="top-down map"></canvas>
      <div class="hud">
        <div>tick <b id="tick">${sim.tick}</b> · wave ${sim.waves.n} · ${speed}×${playing ? '' : ' (paused)'}</div>
        <div>ancient hp ${ancientText(sim)}</div>
        <div>${countsText(sim)}</div>
        <div>game: ${result}</div>
        ${gunnerHud(sim)}
      </div>
      <h2>events</h2>
      <ol class="log">${log.map((l) => html`<li>${l}</li>`)}</ol>
    `;
  }

  function advance(now: number): void {
    const dt = last === undefined ? 0 : Math.min(250, now - last);
    last = now;
    if (!playing) {
      return;
    }
    acc += (dt / 1000) * TICK_HZ * speed;
    let n = 0;
    while (acc >= 1 && n < MAX_STEPS_PER_FRAME) {
      stepOnce();
      acc -= 1;
      n += 1;
    }
    if (n === MAX_STEPS_PER_FRAME) {
      acc = 0;
    }
  }

  function frame(now: number): void {
    advance(now);
    render(view(), root);
    const canvas = root.querySelector('canvas');
    if (canvas) {
      drawSim(canvas, sim, readPalette(root));
    }
    requestAnimationFrame(frame);
  }

  reset();
  requestAnimationFrame(frame);
}
