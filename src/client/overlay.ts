// Debug overlays drawn over the map: bot posts and leashes, move targets, threat rings, clumps,
// combo windows, intents, the Gunner's overpen line. Read-only; every list may be empty.

import type { SeatView } from '../match/match.ts';
import type { Perception } from '../perception/types.ts';
import { TICK_HZ } from '../sim/time.ts';
import { intentColor, intentState, OVERPEN_BLOCKED, OVERPEN_CLEAR } from './colors.ts';
import { secondsText } from './panelmath.ts';
import type { Fit } from './view.ts';
import { toScreen } from './view.ts';

export const OVERLAY_KEYS = ['posts', 'moves', 'threat', 'clumps', 'combos', 'intents', 'overpen'] as const;
export type OverlayKey = (typeof OVERLAY_KEYS)[number];
export type OverlayFlags = Readonly<Record<OverlayKey, boolean>>;

export const OVERLAY_LABELS: Readonly<Record<OverlayKey, string>> = {
  posts: 'post + leash',
  moves: 'move targets',
  threat: 'threat rings',
  clumps: 'clumps',
  combos: 'combo windows',
  intents: 'intents',
  overpen: 'overpen line',
};

export function allOverlays(on: boolean): OverlayFlags {
  return { posts: on, moves: on, threat: on, clumps: on, combos: on, intents: on, overpen: on };
}

/** A hero's last applied `move` command (from the event stream), for when perception has no `dest`. */
export interface RecentMove {
  readonly x: number;
  readonly y: number;
  readonly tick: number;
}

/** A recent move is shown this long after it was applied. */
const RECENT_MOVE_TICKS = 2 * TICK_HZ;

export interface OverlayScene {
  readonly ctx: CanvasRenderingContext2D;
  readonly fit: Fit;
  readonly p: Perception;
  readonly seats: readonly SeatView[];
  readonly moves: ReadonlyMap<number, RecentMove>;
  readonly flags: OverlayFlags;
  readonly color: string;
}

function circle(s: OverlayScene, at: { x: number; y: number }, r: number): void {
  const c = toScreen(s.fit, at.x, at.y);
  s.ctx.beginPath();
  s.ctx.arc(c.x, c.y, Math.max(1, r * s.fit.scale), 0, Math.PI * 2);
  s.ctx.stroke();
}

function line(s: OverlayScene, a: { x: number; y: number }, b: { x: number; y: number }): void {
  const sa = toScreen(s.fit, a.x, a.y);
  const sb = toScreen(s.fit, b.x, b.y);
  s.ctx.beginPath();
  s.ctx.moveTo(sa.x, sa.y);
  s.ctx.lineTo(sb.x, sb.y);
  s.ctx.stroke();
}

function label(s: OverlayScene, at: { x: number; y: number }, text: string): void {
  const c = toScreen(s.fit, at.x, at.y);
  s.ctx.fillStyle = s.color;
  s.ctx.fillText(text, c.x, c.y);
}

function drawPosts(s: OverlayScene): void {
  s.ctx.lineWidth = 1;
  s.ctx.strokeStyle = s.color;
  for (const seat of s.seats) {
    s.ctx.setLineDash([]);
    circle(s, seat.post, 0.6);
    s.ctx.setLineDash([4, 4]);
    circle(s, seat.post, seat.leash);
    label(s, seat.post, `post ${seat.slot}`);
  }
  s.ctx.setLineDash([]);
}

function drawMoves(s: OverlayScene): void {
  s.ctx.lineWidth = 1.5;
  s.ctx.strokeStyle = '#2d6cdf';
  for (const h of s.p.heroes) {
    const recent = s.moves.get(h.id);
    const fresh = recent !== undefined && s.p.tick - recent.tick <= RECENT_MOVE_TICKS ? recent : undefined;
    const to = h.dest ?? fresh;
    if (to === undefined) {
      continue;
    }
    s.ctx.globalAlpha = h.dest === undefined ? 0.4 : 0.9;
    s.ctx.setLineDash([2, 3]);
    line(s, h, to);
    s.ctx.setLineDash([]);
    circle(s, to, 0.5);
  }
  s.ctx.globalAlpha = 1;
}

function drawThreat(s: OverlayScene): void {
  s.ctx.strokeStyle = '#e03030';
  for (const h of s.p.heroes) {
    if (h.threat <= 0) {
      continue;
    }
    const level = Math.min(1, h.threat);
    s.ctx.globalAlpha = 0.35 + 0.65 * level;
    s.ctx.lineWidth = 1 + 3 * level;
    circle(s, h, 1.5 + 2.5 * level);
  }
  s.ctx.globalAlpha = 1;
}

function drawClumps(s: OverlayScene): void {
  s.ctx.strokeStyle = '#a05ac8';
  s.ctx.lineWidth = 1;
  for (const c of s.p.clumps) {
    if (c.count < 2) {
      continue;
    }
    circle(s, c, 1 + 0.5 * Math.sqrt(c.count));
    label(s, c, `x${c.count}`);
  }
}

function drawCombos(s: OverlayScene): void {
  s.ctx.strokeStyle = '#d0509a';
  s.ctx.lineWidth = 1.5;
  s.ctx.setLineDash([6, 3]);
  for (const w of s.p.comboWindows) {
    circle(s, w, w.radius);
    label(s, w, `${w.status} x${w.count} ${secondsText(w.until - s.p.tick)}`);
  }
  s.ctx.setLineDash([]);
}

function drawIntents(s: OverlayScene): void {
  s.ctx.lineWidth = 1;
  for (const i of s.p.intents) {
    const col = intentColor(intentState(i, s.p.tick));
    s.ctx.strokeStyle = col;
    s.ctx.fillStyle = col;
    const c = toScreen(s.fit, i.x, i.y);
    s.ctx.beginPath();
    s.ctx.moveTo(c.x, c.y - 6);
    s.ctx.lineTo(c.x + 6, c.y);
    s.ctx.lineTo(c.x, c.y + 6);
    s.ctx.lineTo(c.x - 6, c.y);
    s.ctx.closePath();
    s.ctx.fill();
    s.ctx.fillText(`${i.intentKind} ${i.fired ? 'fired' : secondsText(i.fireTick - s.p.tick)}`, c.x, c.y - 10);
    s.ctx.setLineDash([3, 3]);
    for (const r of i.reservers) {
      const hero = s.p.heroes.find((h) => h.id === r);
      if (hero !== undefined) {
        line(s, i, hero);
      }
    }
    s.ctx.setLineDash([]);
  }
}

function drawOverpen(s: OverlayScene): void {
  s.ctx.lineWidth = 2;
  for (const h of s.p.heroes) {
    if (h.gunner === undefined || h.target === 0) {
      continue;
    }
    const t = s.p.enemies.find((e) => e.id === h.target);
    if (t === undefined) {
      continue;
    }
    const d = Math.sqrt((t.x - h.x) ** 2 + (t.y - h.y) ** 2);
    const reach = h.gunner.braced ? h.gunner.bracedRange : h.gunner.attackRange;
    const k = d < 1e-9 ? 0 : reach / d;
    s.ctx.strokeStyle = h.lineAllies.length > 0 ? OVERPEN_BLOCKED : OVERPEN_CLEAR;
    line(s, h, { x: h.x + (t.x - h.x) * k, y: h.y + (t.y - h.y) * k });
  }
}

const DRAWERS: Readonly<Record<OverlayKey, (s: OverlayScene) => void>> = {
  posts: drawPosts,
  moves: drawMoves,
  threat: drawThreat,
  clumps: drawClumps,
  combos: drawCombos,
  intents: drawIntents,
  overpen: drawOverpen,
};

export function drawOverlays(s: OverlayScene): void {
  s.ctx.save();
  s.ctx.textAlign = 'center';
  s.ctx.font = '10px system-ui, sans-serif';
  for (const key of OVERLAY_KEYS) {
    if (s.flags[key]) {
      s.ctx.save();
      DRAWERS[key](s);
      s.ctx.restore();
    }
  }
  s.ctx.restore();
}
