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
const MAX_CALLOUTS = 8;

interface Callout {
  readonly text: string;
  /** World position at spawn. */
  readonly x: number;
  readonly y: number;
  readonly big: boolean;
  readonly startMs: number;
  readonly durationMs: number;
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

function drawCallout(view: FeedbackView, c: Callout): void {
  const at = view.project({ x: c.x, y: c.y });
  if (at === undefined || typeof document === 'undefined') {
    return;
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
  const times = !big && p.count > 1 ? ` x${p.count}` : '';
  const text = big ? `WOMBO x${p.count}!` : `${label(p.label)}${times}!`;
  return { text, x: at.x, y: at.y, big, startMs: 0, durationMs: big ? WOMBO_CALLOUT_MS : CALLOUT_MS };
}

/** A feedback sink with real audio when the platform has it (silent otherwise). */
export function createFeedback(options: FeedbackOptions = {}): Feedback {
  const audio = options.audio ?? createAudio();
  const label = options.statusLabel ?? ((s: string) => s.toUpperCase());
  const tracker = createPayoffTracker();
  const clock = createVisualClock();
  let live: Callout[] = [];
  let view: FeedbackView | undefined;

  audio.unlock();

  const onPayoff = (p: Payoff, snap: Snapshot | undefined, nowMs: number): void => {
    clock.hold(nowMs + (p.kind === 'wombo' ? HITSTOP_WOMBO_MS : HITSTOP_CASHIN_MS));
    audio.play(p.kind);
    const c = calloutFor(p, snap, label);
    if (c !== undefined) {
      const placed = { ...c, startMs: nowMs };
      live = [...live.filter((k) => nowMs < k.startMs + k.durationMs), placed].slice(-MAX_CALLOUTS);
      if (view !== undefined) {
        drawCallout(view, placed);
      }
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
    callouts: (nowMs) => live.filter((k) => nowMs >= k.startMs && nowMs < k.startMs + k.durationMs),
    setView(next) {
      view = next;
    },
    dispose() {
      view = undefined;
      live = [];
      audio.dispose();
    },
  };
}
