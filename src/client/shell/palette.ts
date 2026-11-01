// Colour tokens (dark, grimdark) and colour helpers for the scene. Owner: w7-scene.
// The contracts slice ships a working minimal version so intentfx (w7-arming) and the scene can use
// it from day one; w7-scene may add tokens and refine values (keep existing names and signatures).
// Entity, status and resource colours come from content/presentation.ts, not from here.

import type { Rgba } from './types.ts';

export interface Palette {
  readonly background: Rgba;
  readonly ground: Rgba;
  readonly lane: Rgba;
  readonly ancient: Rgba;
  readonly rangeDecal: Rgba;
  readonly aimDecal: Rgba;
  readonly hpBack: Rgba;
  readonly hpFill: Rgba;
  readonly selection: Rgba;
  readonly intent: Rgba;
  readonly hitFlash: Rgba;
}

export const PALETTE: Palette = {
  background: [0.05, 0.05, 0.06, 1],
  ground: [0.1, 0.1, 0.11, 1],
  lane: [0.2, 0.18, 0.15, 1],
  ancient: [0.55, 0.45, 0.2, 1],
  rangeDecal: [0.9, 0.9, 0.9, 0.12],
  aimDecal: [0.95, 0.85, 0.4, 0.3],
  hpBack: [0, 0, 0, 0.6],
  hpFill: [0.35, 0.8, 0.4, 1],
  selection: [1, 1, 1, 0.9],
  intent: [0.9, 0.7, 0.3, 0.9],
  hitFlash: [1, 1, 1, 0.5],
};

const HEX = /^#(?<r>[0-9a-f]{2})(?<g>[0-9a-f]{2})(?<b>[0-9a-f]{2})$/iu;

/** `#rrggbb` to straight RGBA; an unparsable string gives opaque magenta so a bad token is visible. */
export function parseHex(hex: string, alpha = 1): Rgba {
  const g = HEX.exec(hex)?.groups;
  if (g === undefined) {
    return [1, 0, 1, alpha];
  }
  const channel = (s: string | undefined): number => Number.parseInt(s ?? '0', 16) / 255;
  return [channel(g.r), channel(g.g), channel(g.b), alpha];
}

export function withAlpha(c: Rgba, alpha: number): Rgba {
  return [c[0], c[1], c[2], alpha];
}
