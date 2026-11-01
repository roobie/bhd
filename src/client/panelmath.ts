// Pure numbers for the viewer panels and overlays: score bars, sparkline scaling, countdowns.

import { TICK_HZ } from '../sim/time.ts';

export interface Bar {
  readonly id: string;
  /** Bar length 0..1, relative to the largest magnitude among the options. */
  readonly frac: number;
  readonly negative: boolean;
  readonly picked: boolean;
  readonly score: number;
}

/** Bars for one decision's options. All-zero scores give empty bars. */
export function scoreBars(options: readonly { readonly id: string; readonly score: number }[], picked: string): Bar[] {
  let top = 0;
  for (const o of options) {
    top = Math.max(top, Math.abs(o.score));
  }
  return options.map((o) => ({
    id: o.id,
    frac: top === 0 ? 0 : Math.abs(o.score) / top,
    negative: o.score < 0,
    picked: o.id === picked,
    score: o.score,
  }));
}

/** Ticks as `1.2s`; negative values show as `0.0s`. */
export function secondsText(t: number): string {
  return `${Math.max(0, t / TICK_HZ).toFixed(1)}s`;
}

/** Appends `v` to `history`, keeping the last `max` samples. */
export function pushSample(history: number[], v: number, max: number): void {
  history.push(v);
  if (history.length > max) {
    history.splice(0, history.length - max);
  }
}

/** SVG polyline `points` for `values` (expected within 0..1) in a `w` x `h` box; y grows downward. */
export function sparkPoints(values: readonly number[], w: number, h: number): string {
  if (values.length === 0) {
    return '';
  }
  const step = values.length > 1 ? w / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const clamped = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
      return `${(i * step).toFixed(1)},${(h - clamped * h).toFixed(1)}`;
    })
    .join(' ');
}
