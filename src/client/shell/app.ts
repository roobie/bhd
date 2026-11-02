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
import { SYSTEM_PLAYER } from '../../sim/commands.ts';
import { createInstanceBuffer } from '../gl/instances.ts';
import { createRenderer } from '../gl/renderer.ts';
import { fitCamera } from './camera.ts';
import { shellSpec } from './config.ts';
import { initialControls, reduce } from './controls.ts';
import { localDriver } from './driver.ts';
import { DEFAULT_FRAME_OPTIONS, newFrameClock, planFrame, stepBudget } from './frame.ts';
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
  DriverInfo,
  DriverNotice,
  Effect,
  EntitySnap,
  FrameClock,
  HudInput,
  HudNetInput,
  Insets,
  NetNotice,
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

/** How long a callout about another player's action stays up. */
const NOTICE_MS = 5000;

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

function defaultDownload(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/x-ndjson' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function defaultSchedule(frame: (nowMs: number) => void): () => void {
  const id = globalThis.requestAnimationFrame(frame);
  return () => globalThis.cancelAnimationFrame(id);
}

export function mountShell(els: ShellElements, config: ShellConfig, options?: ShellOptions): ShellHandle {
  const now = options?.now ?? (() => performance.now());
  const schedule = options?.schedule ?? defaultSchedule;
  const ui = defaultPresentation();
  const feedback = options?.feedback;
  // One configured hero is a solo game: selecting another hero takes it over (the others become bots).
  // Co-op (several humans): ownership is fixed, nobody takes over, and the bots-pick toggle is gone.
  const localPlayers = options?.localPlayers;
  const humanSlots = options?.humanSlots;
  const coop = localPlayers !== undefined && humanSlots !== undefined;
  const spec = options?.spec ?? (coop ? { ...shellSpec(config), networked: true } : shellSpec(config));
  const solo = !coop && config.drive.length === 1;
  const startDriven = (): readonly number[] => localPlayers ?? config.drive;
  let driven: readonly number[] = startDriven();
  /** Slots whose human dropped (a bot has the hero), as far as the driver has said. */
  let dropped: readonly number[] = [];
  let notices: (NetNotice & { readonly untilMs: number })[] = [];
  let pausedBy: number | undefined;
  let endedBy: DriverInfo['endedBy'];
  let unsubscribe: () => void = () => undefined;
  let lastStatus: string | undefined;
  let frameAlpha = 0;
  // The "Bots pick bargains" toggle: off = a human decides every offer. It survives a restart.
  let botsPick = false;

  let match: Match = buildMatch(spec);
  const makeDriver = (m: Match): TickDriver => options?.driver?.(m) ?? localDriver(m, INPUT_DELAY_TICKS);
  // An injected driver (networked play) is built once, by the setup's `restart()`: building it here too
  // would make a second sequencer whose disposal tells the other peers `bye`. Until then a local one idles.
  let driver: TickDriver = bindDriver(
    options?.driver === undefined ? makeDriver(match) : localDriver(match, INPUT_DELAY_TICKS),
  );
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
        unsubscribe();
        driver.dispose();
        cancelFrame();
        teardown();
      }
    },
  });

  /** Listens to the driver's notices for the panels and callouts. */
  function bindDriver(d: TickDriver): TickDriver {
    unsubscribe = d.onNotice((n) => onNotice(n));
    return d;
  }

  function onNotice(n: DriverNotice): void {
    switch (n.kind) {
      case 'paused':
        pausedBy = n.by;
        notify('pause', n.by);
        break;
      case 'resumed':
        pausedBy = undefined;
        notify('resume', n.by);
        break;
      case 'dropped':
        for (const slot of n.slots) {
          if (!dropped.includes(slot)) {
            dropped = [...dropped, slot];
            notify('drop', slot);
          }
        }
        break;
      case 'hostLeft':
        endedBy = 'host-left';
        break;
      case 'calledWave':
        notify('call', n.by);
        break;
      default:
        break;
    }
    hudDirty = true;
  }

  function restart(): void {
    match = buildMatch(spec);
    driven = startDriven();
    dropped = [];
    notices = [];
    pausedBy = undefined;
    endedBy = undefined;
    // A fresh solo match at tick 0: this is its initial configuration, not a mid-game change. In
    // networked play the spec carries the policy and the shell does not override it.
    if (!coop) {
      match.setBargainPolicy(botsPick ? 'bots' : 'human');
    }
    unsubscribe();
    driver.dispose();
    driver = bindDriver(makeDriver(match));
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

  /** Slots another human drives and who has not dropped (co-op); empty in solo. */
  function others(): readonly number[] {
    return (humanSlots ?? []).filter((s) => !(driven.includes(s) || dropped.includes(s)));
  }

  /** Hero entity ids another human drives. */
  function lockedHeroes(): readonly number[] {
    const taken = others();
    const p = match.perception;
    return [...p.heroes, ...p.fallen].filter((h) => taken.includes(h.slot)).map((h) => h.id);
  }

  function control(cmd: Command): void {
    driver.submit(SYSTEM_PLAYER, cmd);
  }

  /** Solo: choosing a hero makes it the human's and hands the previous one back to its bot. */
  function takeOver(action: UiAction): void {
    if (!solo || controls === undefined) {
      return;
    }
    const slot = selectedSlot(action, controls);
    if (slot !== undefined && Number.isInteger(slot) && slot >= 0 && slot <= 3 && driven[0] !== slot) {
      const [old] = driven;
      driven = [slot];
      // Through the driver, so the handover lands at the same tick everywhere. `driven` flips now so
      // the player's next orders already go to the new hero.
      if (old !== undefined) {
        control({ kind: 'control', op: 'drive', slot: old, by: 'bot' });
      }
      control({ kind: 'control', op: 'drive', slot, by: 'human' });
    }
  }

  function togglePause(): boolean {
    driver.setPaused(driver.status() !== 'paused', driven[0] ?? 0);
    hudDirty = true;
    return true;
  }

  function setBotsPick(on: boolean): void {
    if (!coop) {
      botsPick = on;
      control({ kind: 'control', op: 'bargainPolicy', policy: on ? 'bots' : 'human' });
      hudDirty = true;
    }
  }

  function downloadDump(): void {
    const text = driver.dump();
    if (text !== undefined) {
      (options?.download ?? defaultDownload)('bhd-desync.ndjson', text);
    }
  }

  /** Actions the app handles itself (restart, toggles, pause, dump); true = consumed. */
  function intercept(action: UiAction): boolean {
    switch (action.kind) {
      case 'restart':
        if (options?.onRestart?.() !== true) {
          restart();
        }
        return true;
      case 'bargainBots':
        setBotsPick(action.on);
        return true;
      case 'dumpDesync':
        downloadDump();
        return true;
      case 'pause':
        return togglePause();
      case 'select':
        return others().includes(action.slot);
      default:
        return false;
    }
  }

  function dispatch(action: UiAction): void {
    if (disposed || controls === undefined || intercept(action)) {
      return;
    }
    takeOver(action);
    const result = reduce(controls, action, {
      p: match.perception,
      driven,
      ui,
      maxOffsetSeconds: match.sim.game.intents.maxOffsetSeconds,
      lockedHeroes: lockedHeroes(),
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

  /** Callouts are for co-op; solo has nobody else to name. */
  function notify(kind: NetNotice['kind'], slot: number): void {
    if (coop) {
      notices = [...notices, { kind, slot, untilMs: now() + NOTICE_MS }].slice(-3);
    }
  }

  /** Tracks the driver's status and expires old callouts. */
  function watchDriver(realMs: number): void {
    const status = driver.status();
    if (status !== lastStatus) {
      lastStatus = status;
      hudDirty = true;
    }
    if (notices.some((n) => n.untilMs <= realMs)) {
      notices = notices.filter((n) => n.untilMs > realMs);
      hudDirty = true;
    }
  }

  /** Runs this frame's steps: the wall clock's, plus catch-up, and never past what the driver has sealed. */
  function stepFrame(realMs: number, nowMs: number): void {
    watchDriver(realMs);
    const plan = planFrame(clock, realMs, {
      ...DEFAULT_FRAME_OPTIONS,
      paused: driver.status() === 'paused',
    });
    ({ clock } = plan);
    frameAlpha = plan.alpha;
    // A stall or a pause just stops stepping; the frame still draws and the HUD still answers.
    const budget = stepBudget(plan.steps, match.tick, driver.steppable());
    for (let i = 0; i < budget && !match.ended && end === undefined && canStep(); i++) {
      stepOnce(realMs, nowMs);
    }
  }

  function canStep(): boolean {
    return match.tick < driver.steppable() && driver.status() === 'running';
  }

  /** The networked part of the HUD input; absent in solo. */
  function netInput(): Pick<HudInput, 'coop' | 'others' | 'names' | 'net' | 'paused'> {
    const status = driver.status();
    const net: HudNetInput = {
      status,
      info: { ...(pausedBy === undefined ? {} : { pausedBy }), ...(endedBy === undefined ? {} : { endedBy }) },
      canDump: driver.dump() !== undefined,
      notices,
    };
    return {
      paused: status === 'paused',
      ...(coop ? { coop, others: others() } : {}),
      ...(options?.names === undefined ? {} : { names: options.names }),
      net,
    };
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
      watchDriver(realMs);
      stepFrame(realMs, nowMs);
      const p = match.perception;
      drawn = interpolate(prev, curr, frameAlpha);
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
          tickF: p.tick + frameAlpha,
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
            ...netInput(),
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
