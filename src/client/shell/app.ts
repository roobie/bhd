// The shell: wires the match, the frame loop, renderer, input and HUD. Owner: w7-shell.
//
// Contract: builds the match through `buildMatch` (match/run.ts) with `humans: config.drive`;
// creates `localSink(match, INPUT_DELAY_TICKS)` unless `options.sink` is given; each animation frame
// runs `planFrame`, steps the match `steps` times (snapshot after each, effects advanced from the
// events), draws `interpolate(prev, curr, alpha)` through `buildScene` and the renderer, and
// re-renders the HUD when the sim tick or the controls changed. Actions go through `reduce`; its
// commands are submitted as player = the driven slot (the selected hero's slot) through the sink.
// `performance.now` is read here and nowhere else; real time never reaches the sim. Without WebGL2
// (`createRenderer` returns undefined, or any part of the setup throws) it shows a message with a
// link to index.html and runs no loop (`rendering` false). `restart` rebuilds the match.

import { defaultPresentation } from '../../content/presentation.ts';
import type { Match } from '../../match/match.ts';
import { buildMatch } from '../../match/run.ts';
import { createInstanceBuffer } from '../gl/instances.ts';
import { createRenderer } from '../gl/renderer.ts';
import { fitCamera } from './camera.ts';
import { shellSpec } from './config.ts';
import { initialControls, reduce } from './controls.ts';
import { DEFAULT_FRAME_OPTIONS, newFrameClock, planFrame } from './frame.ts';
import { createHud } from './hud.ts';
import { buildHudModel, hudInsets } from './hudmodel.ts';
import { attachInput } from './input.ts';
import { interpolate } from './interp.ts';
import { PALETTE } from './palette.ts';
import { buildScene } from './scene.ts';
import { localSink } from './sink.ts';
import { advanceEffects, takeSnapshot } from './snapshot.ts';
import type {
  Camera,
  CommandSink,
  ControlState,
  Effect,
  EntitySnap,
  FrameClock,
  HudInput,
  Insets,
  ShellConfig,
  ShellElements,
  ShellHandle,
  ShellOptions,
  Snapshot,
  UiAction,
} from './types.ts';
import { INPUT_DELAY_TICKS } from './types.ts';

type EndInfo = NonNullable<HudInput['end']>;

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

/** Reads the device safe-area insets (css px) through a throwaway probe element. */
function readSafeInsets(root: HTMLElement): Insets {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;visibility:hidden;pointer-events:none;width:0;height:0;' +
    'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  root.append(probe);
  const cs = globalThis.getComputedStyle(probe);
  const px = (v: string): number => {
    const n = Number.parseFloat(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };
  const insets = {
    top: px(cs.paddingTop),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft),
  };
  probe.remove();
  return insets;
}

function fallback(root: HTMLElement, detail: string): void {
  const box = document.createElement('div');
  box.className = 'shell-fallback';
  box.setAttribute('role', 'alert');
  box.dataset.detail = detail;
  const text = document.createElement('p');
  text.textContent = 'WebGL2 unavailable: this page needs it to draw the game.';
  const link = document.createElement('a');
  link.href = 'index.html';
  link.textContent = 'Open the debug viewer instead';
  box.append(text, link);
  root.replaceChildren(box);
}

function defaultSchedule(frame: (nowMs: number) => void): () => void {
  const id = globalThis.requestAnimationFrame(frame);
  return () => globalThis.cancelAnimationFrame(id);
}

export function mountShell(els: ShellElements, config: ShellConfig, options?: ShellOptions): ShellHandle {
  const now = options?.now ?? (() => performance.now());
  const schedule = options?.schedule ?? defaultSchedule;
  const ui = defaultPresentation();
  const spec = shellSpec(config);
  const driven = config.drive;

  let match: Match = buildMatch(spec);
  let sink: CommandSink = options?.sink ?? localSink(match, INPUT_DELAY_TICKS);
  let controls: ControlState | undefined;
  let clock: FrameClock = newFrameClock();
  let prev: Snapshot | undefined;
  let curr: Snapshot | undefined;
  let effects: Effect[] = [];
  let drawn: readonly EntitySnap[] = [];
  let end: EndInfo | undefined;
  let hudTick = -1;
  let hudDirty = true;
  let camera: Camera | undefined;
  let disposed = false;
  let cancelFrame: () => void = () => undefined;
  let teardown: () => void = () => undefined;

  const handle = (rendering: boolean): ShellHandle => ({
    match: () => match,
    controls: () => {
      if (controls === undefined) {
        throw new Error('controls are not available');
      }
      return controls;
    },
    dispatch: (action) => dispatch(action),
    rendering,
    dispose: () => {
      if (!disposed) {
        disposed = true;
        cancelFrame();
        teardown();
      }
    },
  });

  function restart(): void {
    match = buildMatch(spec);
    if (options?.sink === undefined) {
      sink = localSink(match, INPUT_DELAY_TICKS);
    }
    controls = initialControls(driven[0] ?? 0);
    clock = newFrameClock();
    prev = takeSnapshot(match.sim, undefined);
    curr = prev;
    effects = [];
    end = undefined;
    hudTick = -1;
    hudDirty = true;
  }

  function dispatch(action: UiAction): void {
    if (disposed || controls === undefined) {
      return;
    }
    if (action.kind === 'restart') {
      restart();
      return;
    }
    const result = reduce(controls, action, { p: match.perception, driven, ui });
    const player = controls.selected;
    controls = result.state;
    for (const cmd of result.commands) {
      sink.submit(player, cmd);
    }
    hudDirty = true;
  }

  function stepOnce(nowMs: number): void {
    const events = match.step();
    prev = curr;
    curr = takeSnapshot(match.sim, prev);
    // Dead entities are gone from `curr`; the predecessor still has them.
    effects = advanceEffects(effects, events, prev ?? curr, nowMs);
    for (const e of events) {
      if (e.kind === 'end') {
        end = { reason: e.reason, wave: e.wave };
      }
    }
    if (end === undefined && match.tick >= spec.maxTicks) {
      end = { reason: 'maxTicks', wave: match.sim.waves.n };
    }
  }

  const renderer = createRenderer(els.canvas);
  if (renderer === undefined) {
    fallback(els.hud, 'createRenderer returned undefined');
    return handle(false);
  }
  try {
    const buffer = createInstanceBuffer();
    restart();
    const hud = createHud(els.hud, {
      dispatch: (a) => dispatch(a),
      screenToWorld: (p) =>
        (camera ?? fitCamera(match.sim.game.map, { width: 1, height: 1 }, NO_INSETS)).screenToWorld(p),
    });
    const resize = (): void => {
      const width = Math.max(1, els.canvas.clientWidth);
      const height = Math.max(1, els.canvas.clientHeight);
      renderer.resize(width, height, globalThis.devicePixelRatio || 1);
      const size = { width, height };
      camera = fitCamera(match.sim.game.map, size, hudInsets(size, readSafeInsets(els.hud)));
    };
    resize();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
    observer?.observe(els.canvas);
    const detach = attachInput({
      canvas: els.canvas,
      camera: () => camera ?? fitCamera(match.sim.game.map, { width: 1, height: 1 }, NO_INSETS),
      entities: () => drawn,
      state: () => {
        if (controls === undefined) {
          throw new Error('controls are not available');
        }
        return controls;
      },
      dispatch: (a) => dispatch(a),
    });
    renderer.onLoss((lost) => {
      els.canvas.dataset.lost = String(lost);
    });

    const frame = (): void => {
      if (disposed || controls === undefined || camera === undefined || curr === undefined) {
        return;
      }
      const nowMs = now();
      const plan = planFrame(clock, nowMs, { ...DEFAULT_FRAME_OPTIONS, paused: controls.paused });
      ({ clock } = plan);
      for (let i = 0; i < plan.steps && !match.ended && end === undefined; i++) {
        stepOnce(nowMs);
      }
      const p = match.perception;
      drawn = interpolate(prev, curr, plan.alpha);
      buffer.clear();
      buildScene(
        {
          map: match.sim.game.map,
          entities: drawn,
          p,
          controls,
          camera,
          ui,
          driven,
          effects,
          nowMs,
          tickF: p.tick + plan.alpha,
        },
        buffer,
      );
      renderer.draw(buffer, camera, PALETTE.background);
      if (hudDirty || hudTick !== match.tick) {
        hudTick = match.tick;
        hudDirty = false;
        hud.render(buildHudModel({ p, ui, controls, driven, end }));
      }
    };
    const loop = (): void => {
      if (disposed) {
        return;
      }
      cancelFrame = schedule(loop);
      frame();
    };
    teardown = () => {
      detach();
      observer?.disconnect();
      hud.dispose();
      renderer.dispose();
    };
    cancelFrame = schedule(loop);
    return handle(true);
  } catch (error) {
    renderer.dispose();
    cancelFrame();
    fallback(els.hud, error instanceof Error ? error.message : String(error));
    return handle(false);
  }
}
