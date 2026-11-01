// Canvas 2D drawing for the debug viewer. Read-only over the sim.

import type { Match } from '../match/match.ts';
import type { Entity } from '../sim/entities.ts';
import type { Sim } from '../sim/sim.ts';
import { heroColor, statusLetters, teamColor } from './colors.ts';
import type { OverlayFlags, RecentMove } from './overlay.ts';
import { drawOverlays } from './overlay.ts';
import type { Fit } from './view.ts';
import { fitWorld, toScreen } from './view.ts';

interface Palette {
  readonly bg: string;
  readonly fg: string;
  readonly lane: string;
  readonly border: string;
}

/** Reads the theme colours from CSS custom properties so light/dark follows prefers-color-scheme. */
export function readPalette(el: Element): Palette {
  const css = getComputedStyle(el);
  const get = (name: string, fallback: string): string => css.getPropertyValue(name).trim() || fallback;
  return {
    bg: get('--map-bg', '#fff'),
    fg: get('--fg', '#000'),
    lane: get('--lane', '#999'),
    border: get('--border', '#ccc'),
  };
}

/** Resizes the backing store to the CSS size (times devicePixelRatio). Returns CSS pixel size. */
function syncSize(canvas: HTMLCanvasElement): { readonly w: number; readonly h: number; readonly dpr: number } {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, Math.round(canvas.clientWidth));
  const h = Math.max(1, Math.round(canvas.clientHeight));
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  return { w, h, dpr };
}

function drawLane(ctx: CanvasRenderingContext2D, sim: Sim, fit: Fit, pal: Palette): void {
  const { lane } = sim.game.map;
  ctx.strokeStyle = pal.lane;
  ctx.lineWidth = Math.max(2, fit.scale * 0.8);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  lane.forEach((pt, i) => {
    const s = toScreen(fit, pt.x, pt.y);
    if (i === 0) {
      ctx.moveTo(s.x, s.y);
    } else {
      ctx.lineTo(s.x, s.y);
    }
  });
  ctx.stroke();
  ctx.fillStyle = pal.fg;
  for (const pt of lane) {
    const s = toScreen(fit, pt.x, pt.y);
    ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
  }
}

function drawMap(ctx: CanvasRenderingContext2D, sim: Sim, fit: Fit, pal: Palette): void {
  const { width, height } = sim.game.map;
  const o = toScreen(fit, 0, 0);
  ctx.fillStyle = pal.bg;
  ctx.strokeStyle = pal.border;
  ctx.lineWidth = 1;
  ctx.fillRect(o.x, o.y, width * fit.scale, height * fit.scale);
  ctx.strokeRect(o.x, o.y, width * fit.scale, height * fit.scale);
  drawLane(ctx, sim, fit, pal);
}

function entityColor(e: Readonly<Entity>): string {
  if (e.kind === 'hero') {
    return heroColor(e.def);
  }
  return e.kind === 'ancient' ? '#d4af37' : teamColor(e.team, e.def);
}

function hpColor(frac: number): string {
  if (frac > 0.5) {
    return '#3a3';
  }
  return frac > 0.25 ? '#ca3' : '#c33';
}

function drawHpBar(
  ctx: CanvasRenderingContext2D,
  e: Readonly<Entity>,
  at: { x: number; y: number; r: number },
  border: string,
): void {
  const { r } = at;
  const bw = Math.max(14, r * 2);
  const frac = e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;
  ctx.fillStyle = border;
  ctx.fillRect(at.x - bw / 2, at.y - r - 6, bw, 3);
  ctx.fillStyle = hpColor(frac);
  ctx.fillRect(at.x - bw / 2, at.y - r - 6, bw * frac, 3);
}

interface Scene {
  readonly fit: Fit;
  readonly pal: Palette;
  readonly tick: number;
}

function drawEntity(ctx: CanvasRenderingContext2D, e: Readonly<Entity>, scene: Scene): void {
  const { fit, pal, tick } = scene;
  const s = toScreen(fit, e.x, e.y);
  const r = Math.max(3, e.radius * fit.scale);
  ctx.fillStyle = entityColor(e);
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = pal.fg;
  ctx.lineWidth = 1;
  ctx.stroke();
  drawHpBar(ctx, e, { x: s.x, y: s.y, r }, pal.border);
  if (e.kind !== 'enemy') {
    ctx.fillStyle = pal.fg;
    ctx.fillText(e.def, s.x, s.y + r + 10);
  }
  const letters = statusLetters(e.statuses, tick);
  if (letters !== '') {
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.fillStyle = '#d22';
    ctx.fillText(letters, s.x, s.y + 3);
    ctx.font = '10px system-ui, sans-serif';
  }
}

/** What to draw over the map. */
export interface Layers {
  readonly flags: OverlayFlags;
  readonly moves: ReadonlyMap<number, RecentMove>;
}

export function drawSim(canvas: HTMLCanvasElement, match: Match, pal: Palette, layers: Layers): void {
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    return;
  }
  const { sim } = match;
  const { w, h, dpr } = syncSize(canvas);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const { width, height } = sim.game.map;
  const fit = fitWorld({ w: width, h: height }, { w, h }, 12);
  drawMap(ctx, sim, fit, pal);
  ctx.font = '10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (const e of sim.entities.values()) {
    drawEntity(ctx, e, { fit, pal, tick: sim.tick });
  }
  if (Object.values(layers.flags).some(Boolean)) {
    drawOverlays({
      ctx,
      fit,
      p: match.perception,
      seats: match.seats,
      moves: layers.moves,
      flags: layers.flags,
      color: pal.fg,
    });
  }
}
