// Payoff feedback: combo callouts, hitstop and stings. Owner: w8-feedback.
// Implements the shell's FeedbackSink seam (onStep / visualTime) without importing it: the shape is
// declared locally and is structurally identical. Visual only: it never touches the sim.

import { createPayoffTracker, type Payoff } from '../../perception/payoffs.ts';
import type { SimEvent } from '../../sim/events.ts';
import { type Audio, createAudio } from '../audio.ts';
import { genericFx } from './snapshot.ts';
import type { Snapshot, Vec2 } from './types.ts';

/** Hitstop lengths in ms: a plain cash-in is a tick, a wombo a beat. */
const HITSTOP_CASHIN_MS = 60;
export const HITSTOP_WOMBO_MS = 120;
/** Visual time catches up at this multiple of real time after a freeze. */
const CATCHUP = 1.6;
/** The visual clock never lags real time by more than this. */
const MAX_LAG_MS = 200;
const CALLOUT_MS = 900;
const WOMBO_CALLOUT_MS = 1400;
/** At most this many callouts are visible at once; a new one past it retires the oldest. */
const MAX_CALLOUTS = 4;
/** A callout of the same kind within this many world units and while still alive absorbs a new one (x N). */
const MERGE_RADIUS = 6;

interface Callout {
  readonly text: string;
  /** World position at spawn. */
  readonly x: number;
  readonly y: number;
  readonly big: boolean;
  readonly startMs: number;
  readonly durationMs: number;
  /** What it announces (a status label, or 'WOMBO'); same-key callouts close in space and time merge. */
  readonly key: string;
  /** Payoffs folded into it. */
  readonly count: number;
}

/** A callout on screen: its data plus the DOM element drawn for it, if any. */
interface LiveCallout {
  data: Callout;
  el?: HTMLElement | undefined;
}

/** Where callouts are drawn: a positioned host element and the camera's world -> css projection. */
interface FeedbackView {
  readonly host: HTMLElement;
  readonly project: (p: Vec2) => Vec2 | undefined;
}

export interface FeedbackOptions {
  readonly audio?: Audio;
  /** Display text for a status id (default: the id upper-cased). */
  readonly statusLabel?: (status: string) => string;
}

export interface Feedback {
  onStep: (events: readonly SimEvent[], prevSnap: Snapshot | undefined, nowMs: number) => void;
  visualTime: (nowMs: number) => number;
  /** Callouts still alive at `nowMs`, oldest first. */
  callouts: (nowMs: number) => readonly Callout[];
  /** Attach (or detach with undefined) the DOM view callouts are drawn into. */
  setView: (view: FeedbackView | undefined) => void;
  dispose: () => void;
}

function positionOf(snap: Snapshot | undefined, id: number): Vec2 | undefined {
  const e = snap?.entities.find((d) => d.id === id);
  return e === undefined ? undefined : { x: e.x, y: e.y };
}

function mid(a: Vec2 | undefined, b: Vec2 | undefined): Vec2 | undefined {
  return a !== undefined && b !== undefined ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : (a ?? b);
}

function drawCallout(view: FeedbackView, c: Callout): HTMLElement | undefined {
  const at = view.project({ x: c.x, y: c.y });
  if (at === undefined || typeof document === 'undefined') {
    return undefined;
  }
  const el = document.createElement('div');
  el.className = c.big ? 'bhd-callout bhd-callout-big' : 'bhd-callout';
  el.textContent = c.text;
  const size = c.big ? 30 : 18;
  el.setAttribute(
    'style',
    `position:absolute;left:${at.x}px;top:${at.y}px;transform:translate(-50%,-50%);pointer-events:none;` +
      `font:800 ${size}px/1 system-ui,sans-serif;letter-spacing:0.06em;white-space:nowrap;z-index:5;` +
      `color:${c.big ? '#ffe9a0' : '#ffffff'};text-shadow:0 0 8px ${c.big ? '#ff9a2a' : '#000'},0 2px 0 #000;`,
  );
  view.host.append(el);
  const rise = c.big ? 56 : 36;
  const anim = el.animate?.(
    [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(0.6)' },
      { opacity: 1, transform: 'translate(-50%,-70%) scale(1.15)', offset: 0.15 },
      { opacity: 1, transform: `translate(-50%,calc(-50% - ${rise * 0.6}px)) scale(1)`, offset: 0.6 },
      { opacity: 0, transform: `translate(-50%,calc(-50% - ${rise}px)) scale(1)` },
    ],
    { duration: c.durationMs, easing: 'ease-out', fill: 'forwards' },
  );
  if (anim === undefined) {
    globalThis.setTimeout(() => el.remove(), c.durationMs);
  } else {
    anim.onfinish = () => el.remove();
  }
  return el;
}

interface VisualClock {
  /** Freezes visual time until real time `until`. */
  hold: (until: number) => void;
  /** Starts the clock at `nowMs` if it has not been read yet. */
  start: (nowMs: number) => void;
  read: (nowMs: number) => number;
}

/** Follows real time except while held (frozen), then catches up. Monotonic and never ahead of real time. */
function createVisualClock(): VisualClock {
  let vt: number | undefined;
  let lastNow = 0;
  let holdUntil = Number.NEGATIVE_INFINITY;
  return {
    hold(until) {
      holdUntil = Math.max(holdUntil, until);
    },
    start(nowMs) {
      if (vt === undefined) {
        vt = nowMs;
        lastNow = nowMs;
      }
    },
    read(nowMs) {
      const now = Number.isFinite(nowMs) ? Math.max(lastNow, nowMs) : lastNow;
      const prev = vt ?? now;
      const dt = now - lastNow;
      lastNow = now;
      const gain = now < holdUntil ? 0 : dt * (now - dt - prev > 0 ? CATCHUP : 1);
      vt = Math.min(now, Math.max(prev + gain, now - MAX_LAG_MS));
      return vt;
    },
  };
}

function calloutFor(p: Payoff, snap: Snapshot | undefined, label: (s: string) => string): Callout | undefined {
  const at =
    p.kind === 'wombo'
      ? mid(positionOf(snap, p.applier), positionOf(snap, p.casher))
      : (positionOf(snap, p.target) ?? positionOf(snap, p.casher));
  if (at === undefined) {
    return undefined;
  }
  const big = p.kind === 'wombo';
  const key = big ? 'WOMBO' : label(p.label);
  return {
    text: calloutText(key, p.count, big),
    x: at.x,
    y: at.y,
    big,
    startMs: 0,
    durationMs: big ? WOMBO_CALLOUT_MS : CALLOUT_MS,
    key,
    count: p.count,
  };
}

function calloutText(key: string, count: number, big: boolean): string {
  if (big) {
    return `WOMBO x${count}!`;
  }
  return count > 1 ? `${key} x${count}!` : `${key}!`;
}

/** The live callout `c` folds into, if any: same key, close in space, still alive at `nowMs`. */
function mergeTarget(live: readonly LiveCallout[], c: Callout, nowMs: number): LiveCallout | undefined {
  return live.find(
    (k) =>
      k.data.key === c.key &&
      nowMs < k.data.startMs + k.data.durationMs &&
      Math.hypot(k.data.x - c.x, k.data.y - c.y) <= MERGE_RADIUS,
  );
}

/**
 * Adds `c` to the live callouts at `nowMs`: expired ones are retired, a same-key one close by absorbs
 * it (keeps its position, restarts its life, bumps the count), and only the newest MAX_CALLOUTS stay.
 */
function place(live: readonly LiveCallout[], c: Callout, view: FeedbackView | undefined, nowMs: number): LiveCallout[] {
  const alive = live.filter((k) => nowMs < k.data.startMs + k.data.durationMs);
  const into = mergeTarget(alive, c, nowMs);
  const count = (into?.data.count ?? 0) + c.count;
  const placed: Callout = {
    ...c,
    x: into?.data.x ?? c.x,
    y: into?.data.y ?? c.y,
    count,
    text: calloutText(c.key, count, c.big),
    startMs: nowMs,
  };
  const kept = into === undefined ? alive : alive.filter((k) => k !== into);
  const all = [...kept, { data: placed, el: view === undefined ? undefined : drawCallout(view, placed) }];
  const retired = [...live.filter((k) => !kept.includes(k)), ...all.slice(0, -MAX_CALLOUTS)];
  for (const k of retired) {
    k.el?.remove();
  }
  return all.slice(-MAX_CALLOUTS);
}

/** A feedback sink with real audio when the platform has it (silent otherwise). */
export function createFeedback(options: FeedbackOptions = {}): Feedback {
  const audio = options.audio ?? createAudio();
  const label = options.statusLabel ?? ((s: string) => s.toUpperCase());
  const tracker = createPayoffTracker();
  const clock = createVisualClock();
  let live: LiveCallout[] = [];
  let view: FeedbackView | undefined;

  audio.unlock();

  const onPayoff = (p: Payoff, snap: Snapshot | undefined, nowMs: number): void => {
    clock.hold(nowMs + (p.kind === 'wombo' ? HITSTOP_WOMBO_MS : HITSTOP_CASHIN_MS));
    audio.play(p.kind);
    const c = calloutFor(p, snap, label);
    if (c !== undefined) {
      live = place(live, c, view, nowMs);
    }
  };

  return {
    onStep(events, prevSnap, nowMs) {
      clock.start(nowMs);
      for (const p of tracker.push(events)) {
        onPayoff(p, prevSnap, nowMs);
      }
      for (const ev of events) {
        if (ev.kind === 'respawn') {
          audio.play('respawn');
        } else if (genericFx(ev) === 'backlash') {
          audio.play('backlash');
        }
      }
    },
    visualTime: (nowMs) => clock.read(nowMs),
    callouts: (nowMs) => live.map((k) => k.data).filter((k) => nowMs >= k.startMs && nowMs < k.startMs + k.durationMs),
    setView(next) {
      view = next;
    },
    dispose() {
      view = undefined;
      for (const k of live) {
        k.el?.remove();
      }
      live = [];
      audio.dispose();
    },
  };
}
