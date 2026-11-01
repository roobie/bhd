// Pure colour and marker mapping for the debug viewer. No DOM.

import type { StatusInstance, Team } from '../sim/entities.ts';

const HERO_COLORS: Readonly<Record<string, string>> = {
  gunner: '#e8832a',
  tank: '#3b82c4',
  ranged: '#2fa36b',
  support: '#c45fa0',
};

/** Stable hue (0..359) from a string, for defs without a fixed colour. */
function hueOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = (h * 31 + text.charCodeAt(i)) % 360;
  }
  return h;
}

export function heroColor(def: string): string {
  return HERO_COLORS[def] ?? `hsl(${hueOf(def)} 60% 50%)`;
}

/** Attackers: red family, lightness varied per def. Defenders: grey. */
export function teamColor(team: Team, def: string): string {
  return team === 1 ? `hsl(${hueOf(def) % 30} 70% ${40 + (hueOf(def) % 20)}%)` : '#888';
}

const STATUS_LETTERS: Readonly<Record<string, string>> = {
  taunted: 'T',
  marked: 'M',
  suppressed: 'S',
  clumped: 'C',
  rooted: 'R',
  exposed: 'E',
};

/** One letter per distinct status active at `tick` (tick < until), in status order; unknown ones as '?'. */
export function statusLetters(statuses: readonly StatusInstance[], tick: number): string {
  const seen = new Set<string>();
  let out = '';
  for (const s of statuses) {
    if (tick < s.until && !seen.has(s.status)) {
      seen.add(s.status);
      out += STATUS_LETTERS[s.status] ?? '?';
    }
  }
  return out;
}
