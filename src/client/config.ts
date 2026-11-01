// Viewer configuration and its URL-hash form. Pure: no DOM, no globals. Every input is validated;
// a bad or missing hash field falls back to the default, so a shared link never throws.

import { defaultBotSetup } from '../content/bots.ts';
import type { Mode } from '../match/run.ts';

export type { Mode } from '../match/run.ts';

export const MODES: readonly Mode[] = ['director', 'schedule'];
const SEATS = 4;
export const DOCTRINE_IDS: readonly string[] = defaultBotSetup().doctrines.map((d) => d.id);

/** Allowed seconds, inclusive. */
export const REACTION_RANGE = { min: 0.1, max: 3 } as const;
export const THINK_RANGE = { min: 0.1, max: 2 } as const;
const UINT32_MAX = 4_294_967_295;
const SEED_RE = /^\d{1,10}$/u;
const SECONDS_RE = /^\d+(?:\.\d+)?$/u;
const HASH_PREFIX = /^#/u;

export interface ViewerConfig {
  readonly seed: number;
  readonly mode: Mode;
  /** Doctrine id per hero slot 0-3. */
  readonly doctrines: readonly string[];
  readonly reactionSeconds: number;
  readonly thinkSeconds: number;
}

export function defaultConfig(): ViewerConfig {
  const first = DOCTRINE_IDS[0] ?? 'hold-the-line';
  return {
    seed: 1,
    mode: 'director',
    doctrines: Array.from({ length: SEATS }, () => first),
    reactionSeconds: 0.4,
    thinkSeconds: 0.5,
  };
}

/** A whole number in 0..2^32-1, or undefined. */
export function parseSeed(text: string): number | undefined {
  const t = text.trim();
  if (!SEED_RE.test(t)) {
    return undefined;
  }
  const v = Number(t);
  return v <= UINT32_MAX ? v : undefined;
}

/** A decimal number within `range`, or undefined. */
export function parseSeconds(text: string, range: { readonly min: number; readonly max: number }): number | undefined {
  const t = text.trim();
  if (!SECONDS_RE.test(t)) {
    return undefined;
  }
  const v = Number(t);
  return Number.isFinite(v) && v >= range.min && v <= range.max ? v : undefined;
}

export function parseMode(text: string): Mode | undefined {
  return MODES.find((m) => m === text);
}

function parseDoctrines(text: string): string[] | undefined {
  const parts = text.split(',');
  if (parts.length !== SEATS || !parts.every((p) => DOCTRINE_IDS.includes(p))) {
    return undefined;
  }
  return parts;
}

/** Parses `#seed=1&mode=director&doc=a,b,c,d&react=0.4&think=0.5`; any invalid field takes its default. */
export function parseHash(hash: string): ViewerConfig {
  const base = defaultConfig();
  const params = new URLSearchParams(hash.replace(HASH_PREFIX, ''));
  const seed = parseSeed(params.get('seed') ?? '');
  const mode = parseMode(params.get('mode') ?? '');
  const doctrines = parseDoctrines(params.get('doc') ?? '');
  const reactionSeconds = parseSeconds(params.get('react') ?? '', REACTION_RANGE);
  const thinkSeconds = parseSeconds(params.get('think') ?? '', THINK_RANGE);
  return {
    seed: seed ?? base.seed,
    mode: mode ?? base.mode,
    doctrines: doctrines ?? base.doctrines,
    reactionSeconds: reactionSeconds ?? base.reactionSeconds,
    thinkSeconds: thinkSeconds ?? base.thinkSeconds,
  };
}

/** The hash form of a config (with the leading `#`); `parseHash` of it gives the config back. */
export function serialiseHash(c: ViewerConfig): string {
  const params = new URLSearchParams();
  params.set('seed', String(c.seed));
  params.set('mode', c.mode);
  params.set('doc', c.doctrines.join(','));
  params.set('react', String(c.reactionSeconds));
  params.set('think', String(c.thinkSeconds));
  return `#${params.toString().replaceAll('%2C', ',')}`;
}
