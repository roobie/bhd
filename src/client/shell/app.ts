// The shell: wires the match, the frame loop, renderer, input and HUD. Owner: w7-shell.
//
// Contract: builds the match through `buildMatch` (match/run.ts) with `humans: config.drive`;
// creates `localDriver(match, INPUT_DELAY_TICKS)` unless `options.driver` is given; each animation frame
// runs `planFrame`, steps the match `steps` times (snapshot after each, effects advanced from the
// events), draws `interpolate(prev, curr, alpha)` through `buildScene` and the renderer, and
// re-renders the HUD when the sim tick or the controls changed. Actions go through `reduce`; its
// commands are submitted as player = the driven slot (the selected hero's slot) through the driver.
// `performance.now` is read here and nowhere else; real time never reaches the sim. Without WebGL2
// (`createRenderer` returns undefined, or any part of the setup throws) it shows a message with a
// link to index.html and runs no loop (`rendering` false). `restart` rebuilds the match.

import { defaultPresentation } from '../../content/presentation.ts';
import type { Match } from '../../match/match.ts';
import { buildMatch } from '../../match/run.ts';
import type { Command } from '../../sim/commands.ts';
import { createInstanceBuffer } from '../gl/instances.ts';
import { createRenderer } from '../gl/renderer.ts';
import { fitCamera } from './camera.ts';
import { shellSpec } from './config.ts';
import { initialControls, reduce } from './controls.ts';
import { localDriver } from './driver.ts';
import { DEFAULT_FRAME_OPTIONS, newFrameClock, planFrame } from './frame.ts';
import { createHud } from './hud.ts';
import { buildHudModel, hudInsets } from './hudmodel.ts';
import { attachInput } from './input.ts';
import { interpolate } from './interp.ts';
import { PALETTE } from './palette.ts';
import { buildScene } from './scene.ts';
import { advanceEffects, takeSnapshot } from './snapshot.ts';
import type {
  Camera,
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
  TickDriver,
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
  const feedback = options?.feedback;
  // One configured hero is a solo game: selecting another hero takes it over (the others become bots).
  const solo = config.drive.length === 1;
  let driven: readonly number[] = config.drive;
  // The "Bots pick bargains" toggle: off = a human decides every offer. It survives a restart.
  let botsPick = false;

  let match: Match = buildMatch(spec);
  const makeDriver = (m: Match): TickDriver => options?.driver?.(m) ?? localDriver(m, INPUT_DELAY_TICKS);
  let driver: TickDriver = makeDriver(match);
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
    driven = config.drive;
    match.setBargainPolicy(botsPick ? 'bots' : 'human');
    driver = makeDriver(match);
    controls = initialControls(driven[0] ?? 0);
    clock = newFrameClock();
    prev = takeSnapshot(match.sim, undefined);
    curr = prev;
    effects = [];
    end = undefined;
    hudTick = -1;
    hudDirty = true;
  }

  /** The hero slot an action selects: the `select` slot, or a plain click on another live hero. */
  function selectedSlot(action: UiAction, state: ControlState): number | undefined {
    if (action.kind === 'select') {
      return action.slot;
    }
    if (action.kind === 'primary' && action.unit !== undefined && state.aim === undefined) {
      return match.perception.heroes.find((h) => h.id === action.unit)?.slot;
    }
    return undefined;
  }

  /** Solo: choosing a hero makes it the human's and hands the previous one back to its bot. */
  function takeOver(action: UiAction): void {
    if (!solo || controls === undefined) {
      return;
    }
    const slot = selectedSlot(action, controls);
    if (slot !== undefined && Number.isInteger(slot) && slot >= 0 && slot <= 3 && driven[0] !== slot) {
      driven = [slot];
      match.setDriven(driven);
    }
  }

  function dispatch(action: UiAction): void {
    if (disposed || controls === undefined) {
      return;
    }
    if (action.kind === 'restart') {
      restart();
      return;
    }
    if (action.kind === 'bargainBots') {
      botsPick = action.on;
      match.setBargainPolicy(botsPick ? 'bots' : 'human');
      hudDirty = true;
      return;
    }
    takeOver(action);
    const result = reduce(controls, action, {
      p: match.perception,
      driven,
      ui,
      maxOffsetSeconds: match.sim.game.intents.maxOffsetSeconds,
    });
    const player = controls.selected;
    controls = result.state;
    for (const cmd of result.commands) {
      driver.submit(cardOwner(cmd) ?? player, cmd);
    }
    hudDirty = true;
  }

  /** Accepting a hero-bound card is submitted as that hero's slot (the sim's bargain ownership rule). */
  function cardOwner(cmd: Command): number | undefined {
    if (cmd.kind !== 'bargain' || cmd.op !== 'accept') {
      return undefined;
    }
    const hero = match.perception.bargains.open
      .find((o) => o.id === cmd.offer)
      ?.cards.find((c) => c.bargain === cmd.card)?.hero;
    const p = match.perception;
    return hero === undefined || hero === 0
      ? undefined
      : (p.heroes.find((h) => h.id === hero) ?? p.fallen.find((h) => h.id === hero))?.slot;
  }

  /** `nowMs` is the real clock, `visualMs` the (possibly hitstop-dilated) effect clock. */
  function stepOnce(nowMs: number, visualMs: number): void {
    driver.beforeStep(match.tick + 1);
    const events = match.step();
    driver.afterStep(events);
    prev = curr;
    curr = takeSnapshot(match.sim, prev);
    // Dead entities are gone from `curr`; the predecessor still has them.
    effects = advanceEffects(effects, events, prev ?? curr, visualMs);
    feedback?.onStep(events, prev, nowMs);
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
  // Teardown is built step by step so a failed setup undoes exactly what it had done.
  const cleanups: (() => void)[] = [() => renderer.dispose()];
  teardown = () => {
    for (const undo of cleanups.splice(0).reverse()) {
      undo();
    }
  };
  try {
    const buffer = createInstanceBuffer();
    restart();
    const hud = createHud(els.hud, {
      dispatch: (a) => dispatch(a),
      mapPoint: (p) => {
        const rect = els.canvas.getBoundingClientRect();
        const local = { x: p.x - rect.left, y: p.y - rect.top };
        const cam = camera;
        return cam?.isMapPoint(local) === true ? cam.screenToWorld(local) : undefined;
      },
    });
    cleanups.push(() => hud.dispose());
    const resize = (): void => {
      const width = Math.max(1, els.canvas.clientWidth);
      const height = Math.max(1, els.canvas.clientHeight);
      renderer.resize(width, height, globalThis.devicePixelRatio || 1);
      const size = { width, height };
      camera = fitCamera(match.sim.game.map, size, hudInsets(size, readSafeInsets(els.hud)));
    };
    resize();
    // Callouts live in their own layer over the canvas (the HUD's renderer owns the HUD root's children).
    if (feedback?.setView !== undefined) {
      const layer = document.createElement('div');
      layer.setAttribute('style', 'position:absolute;inset:0;overflow:hidden;pointer-events:none;');
      els.hud.append(layer);
      feedback.setView({ host: layer, project: (p) => camera?.worldToScreen(p) });
      cleanups.push(() => {
        feedback.setView?.(undefined);
        layer.remove();
      });
    }
    // The canvas CSS size is the page's (never an inline px size), so observing the canvas and its
    // container sees every layout change; window events cover engines that fire no observer.
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resize);
    observer?.observe(els.canvas);
    if (els.canvas.parentElement !== null) {
      observer?.observe(els.canvas.parentElement);
    }
    cleanups.push(() => observer?.disconnect());
    globalThis.addEventListener('resize', resize);
    globalThis.addEventListener('orientationchange', resize);
    cleanups.push(() => {
      globalThis.removeEventListener('resize', resize);
      globalThis.removeEventListener('orientationchange', resize);
    });
    // A device-pixel-ratio change alone (zoom, moving to another screen) moves no box: watch the
    // current ratio and re-arm the query after each change.
    let dprQuery: MediaQueryList | undefined;
    const onDpr = (): void => {
      resize();
      watchDpr();
    };
    const watchDpr = (): void => {
      dprQuery?.removeEventListener('change', onDpr);
      dprQuery =
        typeof globalThis.matchMedia === 'function'
          ? globalThis.matchMedia(`(resolution: ${globalThis.devicePixelRatio || 1}dppx)`)
          : undefined;
      dprQuery?.addEventListener('change', onDpr);
    };
    watchDpr();
    cleanups.push(() => dprQuery?.removeEventListener('change', onDpr));
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
      const realMs = now();
      const nowMs = feedback?.visualTime(realMs) ?? realMs;
      const plan = planFrame(clock, realMs, { ...DEFAULT_FRAME_OPTIONS, paused: controls.paused });
      ({ clock } = plan);
      for (let i = 0; i < plan.steps && !match.ended && end === undefined && match.tick < driver.steppable(); i++) {
        stepOnce(realMs, nowMs);
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
        hud.render(
          buildHudModel({
            p,
            ui,
            controls,
            driven,
            end,
            botsPick,
            maxOffsetSeconds: match.sim.game.intents.maxOffsetSeconds,
            game: match.sim.game,
          }),
        );
      }
    };
    const loop = (): void => {
      if (disposed) {
        return;
      }
      cancelFrame = schedule(loop);
      frame();
    };
    cleanups.push(detach);
    cancelFrame = schedule(loop);
    return handle(true);
  } catch (error) {
    cancelFrame();
    teardown();
    fallback(els.hud, error instanceof Error ? error.message : String(error));
    return handle(false);
  }
}
