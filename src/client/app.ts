// Debug viewer app: read-only. Runs a live Sim, steps it from requestAnimationFrame at TICK_HZ x
// speed, draws it, and shows a HUD. Sends no commands. NOT the game client (wave 7).

import { html, nothing, render } from 'lit-html';
import type { Match } from '../match/match.ts';
import { buildMatch as buildSpecMatch } from '../match/run.ts';
import { TICK_HZ } from '../sim/time.ts';
import type { Mode, ViewerConfig } from './config.ts';
import {
  DOCTRINE_IDS,
  liveConfig,
  MODES,
  parseHash,
  parseMode,
  parseSeconds,
  parseSeed,
  REACTION_RANGE,
  serialiseHash,
  THINK_RANGE,
} from './config.ts';
import { drawSim, readPalette } from './draw.ts';
import type { LogFilters, LogLine, NameBook } from './eventlog.ts';
import { pushEvents, visibleLines } from './eventlog.ts';
import { ancientText, countsText, gunnerHud } from './hud.ts';
import type { OverlayKey, RecentMove } from './overlay.ts';
import { allOverlays, OVERLAY_KEYS, OVERLAY_LABELS } from './overlay.ts';
import { pushSample } from './panelmath.ts';
import { botPanel, directorPanel } from './panels.ts';
import type { ReplayState } from './replay.ts';
import { bannerOf, fastForwardTarget, loadReplay, recordLive, restartReplay } from './replay.ts';
import { buildMatch, configFromSpec } from './setup.ts';
import { serialiseShellHash } from './shell/config.ts';

const SPEEDS = [0.5, 1, 2, 4, 8] as const;
/** Log lines kept per category, and lines shown after filtering. */
const LOG_KEPT = 400;
const LOG_SHOWN = 24;
/** Tension is sampled every this many ticks, up to SPARK_SAMPLES samples. */
const SPARK_EVERY = TICK_HZ / 2;
const SPARK_SAMPLES = 120;
/** Frame gaps longer than this (ms, e.g. a background tab) are clamped so the sim does not fast-forward. */
const MAX_FRAME_MS = 250;
/** Cap on ticks per frame, so a slow frame cannot snowball. */
const MAX_STEPS_PER_FRAME = 64;

/** Mounts the viewer into `root`; the returned function stops it. */
export function mount(root: HTMLElement): () => void {
  let cfg: ViewerConfig = parseHash(globalThis.location.hash);
  let match: Match = buildMatch(cfg);
  let names: NameBook = new Map();
  let log: LogLine[] = [];
  let moves = new Map<number, RecentMove>();
  let tension: number[] = [];
  let overlays = allOverlays(true);
  let filters: LogFilters = { cmd: false, choice: true, intent: true };
  let playing = true;
  let speed = 1;
  let acc = 0;
  let last: number | undefined;
  let endText: string | undefined;
  /** Set when the URL carries `log=`: the game is rebuilt from the log and verified against it. */
  let replay: ReplayState | undefined;
  let replayLoad = 0;
  let raf = 0;
  let palette = readPalette(root);
  const scheme = globalThis.matchMedia('(prefers-color-scheme: dark)');
  const refreshPalette = (): void => {
    palette = readPalette(root);
  };
  scheme.addEventListener('change', refreshPalette);

  /** A replay stops where its log does: a game cut off at maxTicks has no end event, and past it nothing is verified. */
  function stopAtLogEnd(): void {
    if (replay?.kind === 'ready' && endText === undefined && match.tick >= replay.log.header.ticks) {
      endText = `end of log (tick ${replay.log.header.ticks})`;
      playing = false;
    }
  }

  function stepOnce(): void {
    const events = match.step();
    if (replay?.kind === 'ready') {
      recordLive(replay, events);
    }
    pushEvents(log, names, events, LOG_KEPT);
    for (const e of events) {
      if (e.kind === 'end') {
        endText = `${e.reason} (wave ${e.wave})`;
        playing = false;
      } else if (e.kind === 'cmd' && e.cmd.kind === 'move') {
        moves.set(e.cmd.hero, { x: e.cmd.x, y: e.cmd.y, tick: e.tick });
      }
    }
    stopAtLogEnd();
    const status = match.directorStatus;
    if (status !== undefined && match.tick % SPARK_EVERY === 0) {
      pushSample(tension, status.tension, SPARK_SAMPLES);
    }
  }

  function reset(): void {
    const ready = replay?.kind === 'ready' ? replay : undefined;
    if (ready) {
      restartReplay(ready);
    }
    match = ready ? buildSpecMatch(ready.spec) : buildMatch(cfg);
    names = new Map();
    log = [];
    moves = new Map();
    tension = [];
    endText = undefined;
    playing = true;
    acc = 0;
    // Setup events (spawns) are returned by the first step; run it so names are known.
    stepOnce();
    if (ready) {
      fastForward(fastForwardTarget(cfg.tick));
    } else if (replay?.kind === 'loading') {
      playing = false;
    }
  }

  /** Steps to `target` without drawing, then pauses there (a replay link with a tick). */
  function fastForward(target: number): void {
    if (target === 0) {
      return;
    }
    while (match.tick < target && endText === undefined) {
      stepOnce();
    }
    playing = false;
  }

  /** Fetches the log of a replay link, then restarts the game from its header. */
  async function startReplay(url: string): Promise<void> {
    replayLoad += 1;
    const id = replayLoad;
    replay = { kind: 'loading' };
    reset();
    try {
      const loaded = await loadReplay(url);
      if (id !== replayLoad) {
        return;
      }
      cfg = { ...configFromSpec(loaded.spec), log: url, ...(cfg.tick === undefined ? {} : { tick: cfg.tick }) };
      replay = loaded;
      reset();
    } catch (error) {
      if (id === replayLoad) {
        replay = { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
        reset();
      }
    }
  }

  /** Applies a hash change or the first load: a replay link starts a replay, anything else a live game. */
  function load(next: ViewerConfig): void {
    cfg = next;
    replayLoad += 1;
    if (next.log === undefined) {
      replay = undefined;
      reset();
    } else {
      startReplay(next.log).catch(() => undefined);
    }
  }

  /** Applies a changed config: share it in the URL hash, then restart the game. */
  function apply(next: ViewerConfig): void {
    cfg = liveConfig(next);
    replay = undefined;
    replayLoad += 1;
    globalThis.history.replaceState(null, '', serialiseHash(cfg));
    reset();
  }

  const onHashChange = (): void => {
    load(parseHash(globalThis.location.hash));
  };
  globalThis.addEventListener('hashchange', onHashChange);

  function togglePlay(): void {
    playing = !playing;
  }

  function stepButton(): void {
    playing = false;
    stepOnce();
  }

  function onSeed(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const v = parseSeed(input.value);
    if (v === undefined) {
      input.value = String(cfg.seed);
    } else {
      apply({ ...cfg, seed: v });
    }
  }

  function onMode(ev: Event): void {
    const input = ev.target as HTMLSelectElement;
    const v = parseMode(input.value);
    if (v === undefined) {
      input.value = cfg.mode;
    } else {
      apply({ ...cfg, mode: v });
    }
  }

  function onDoctrine(slot: number) {
    return (ev: Event): void => {
      const input = ev.target as HTMLSelectElement;
      if (DOCTRINE_IDS.includes(input.value)) {
        apply({ ...cfg, doctrines: cfg.doctrines.map((d, i) => (i === slot ? input.value : d)) });
      } else {
        input.value = cfg.doctrines[slot] ?? '';
      }
    };
  }

  function onSeconds(key: 'reactionSeconds' | 'thinkSeconds') {
    return (ev: Event): void => {
      const input = ev.target as HTMLInputElement;
      const v = parseSeconds(input.value, key === 'reactionSeconds' ? REACTION_RANGE : THINK_RANGE);
      if (v === undefined) {
        input.value = String(cfg[key]);
      } else {
        apply({ ...cfg, [key]: v });
      }
    };
  }

  function speedButton(s: number) {
    const pick = (): void => {
      speed = s;
    };
    return html`<button type="button" class=${s === speed ? 'on' : ''} aria-pressed=${s === speed} @click=${pick}>${s}×</button>`;
  }

  function overlayToggle(key: OverlayKey) {
    const toggle = (ev: Event): void => {
      overlays = { ...overlays, [key]: (ev.target as HTMLInputElement).checked };
    };
    return html`<label class="chk"><input type="checkbox" data-overlay=${key} .checked=${overlays[key]} @change=${toggle} />${OVERLAY_LABELS[key]}</label>`;
  }

  function filterToggle(key: keyof LogFilters) {
    const toggle = (ev: Event): void => {
      filters = { ...filters, [key]: (ev.target as HTMLInputElement).checked };
    };
    return html`<label class="chk"><input type="checkbox" data-filter=${key} .checked=${filters[key]} @change=${toggle} />${key}</label>`;
  }

  function modeOption(m: Mode) {
    return html`<option value=${m} ?selected=${m === cfg.mode}>${m}</option>`;
  }

  function doctrineSelect(slot: number) {
    const hero = match.sim.game.heroes[slot]?.id ?? `slot ${slot}`;
    return html`<label>${hero}
      <select data-doctrine=${slot} @change=${onDoctrine(slot)}>
        ${DOCTRINE_IDS.map((id) => html`<option value=${id} ?selected=${id === cfg.doctrines[slot]}>${id}</option>`)}
      </select></label>`;
  }

  function replayBanner() {
    if (replay === undefined) {
      return nothing;
    }
    const b = bannerOf(replay);
    return html`<p class="replay ${b.tone}" role="status">${b.text}</p>`;
  }

  function view() {
    const { sim } = match;
    const result = endText ?? 'running';
    return html`
      <h1>BHD debug viewer</h1>
      <p class="note">debug viewer — not the game client (wave 7). Read-only: bots play, you watch. <a href=${`play.html#${serialiseShellHash({ seed: cfg.seed, mode: cfg.mode, drive: [0] })}`}>play this seed</a></p>
      ${replayBanner()}
      <div class="controls">
        <button type="button" @click=${togglePlay}>${playing ? 'Pause' : 'Play'}</button>
        <button type="button" @click=${stepButton}>Step</button>
        ${SPEEDS.map(speedButton)}
        <button type="button" @click=${reset}>Reset</button>
      </div>
      <div class="controls config">
        <label>seed <input type="number" min="0" step="1" .value=${String(cfg.seed)} @change=${onSeed} /></label>
        <label>mode <select @change=${onMode}>${MODES.map(modeOption)}</select></label>
        <label>reaction s <input type="number" min=${REACTION_RANGE.min} max=${REACTION_RANGE.max} step="0.1" .value=${String(cfg.reactionSeconds)} @change=${onSeconds('reactionSeconds')} /></label>
        <label>think s <input type="number" min=${THINK_RANGE.min} max=${THINK_RANGE.max} step="0.1" .value=${String(cfg.thinkSeconds)} @change=${onSeconds('thinkSeconds')} /></label>
      </div>
      <div class="controls doctrines">${[0, 1, 2, 3].map(doctrineSelect)}</div>
      <div class="controls overlays" aria-label="overlays">${OVERLAY_KEYS.map(overlayToggle)}</div>
      <canvas aria-label="top-down map"></canvas>
      <div class="hud">
        <div>tick <b id="tick">${sim.tick}</b> · wave ${sim.waves.n} · ${speed}×${playing ? '' : ' (paused)'}</div>
        <div>ancient hp ${ancientText(sim)}</div>
        <div>${countsText(sim)}</div>
        <div>game: ${result}</div>
        ${gunnerHud(sim)}
      </div>
      <div class="panels">${botPanel(match)}${directorPanel(match, tension)}</div>
      <h2>events</h2>
      <div class="controls filters" aria-label="event filters">${(['cmd', 'choice', 'intent'] as const).map(filterToggle)}</div>
      <ol class="log">${visibleLines(log, filters, LOG_SHOWN).map((l) => html`<li class=${l.cat}>${l.text}</li>`)}</ol>
    `;
  }

  function advance(now: number): void {
    const dt = last === undefined ? 0 : Math.min(MAX_FRAME_MS, now - last);
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
      drawSim(canvas, match, palette, { flags: overlays, moves });
    }
    raf = requestAnimationFrame(frame);
  }

  load(cfg);
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    scheme.removeEventListener('change', refreshPalette);
    globalThis.removeEventListener('hashchange', onHashChange);
  };
}
