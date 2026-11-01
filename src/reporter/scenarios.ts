// Scenarios: the built-in `quick` and `deep` batches, custom scenario JSON, and the GameSpecs a
// scenario expands to for one side.

import { readFileSync } from 'node:fs';
import type { ConfigOverrides } from '../content/overrides.ts';
import type { GameSpec, Mode } from '../match/run.ts';
import { DEFAULT_HASH_EVERY, DEFAULT_MAX_TICKS, RUN_ABI } from '../match/run.ts';
import type { Scenario } from './types.ts';

const LINEUPS: readonly (readonly string[])[] = [
  ['hold-the-line', 'hold-the-line', 'hold-the-line', 'hold-the-line'],
  ['greedy', 'greedy', 'greedy', 'greedy'],
];

function builtin(id: string, seedsPerLineup: number): Scenario {
  return {
    id,
    mode: 'director',
    seeds: { from: 1, count: seedsPerLineup },
    lineups: LINEUPS,
    reactionSeconds: 0.4,
    thinkSeconds: 0.5,
    maxTicks: DEFAULT_MAX_TICKS,
    hashEvery: DEFAULT_HASH_EVERY,
  };
}

/** 100 games per side. */
export const QUICK: Scenario = builtin('quick', 50);
/** 2,000 games per side. */
export const DEEP: Scenario = builtin('deep', 1000);

/** Games per side: lineups x seeds. */
export function gamesOf(s: Scenario): number {
  return s.lineups.length * s.seeds.count;
}

/** The same grid shrunk or grown to about `games` games per side (rounded up to whole lineups). */
export function withGames(s: Scenario, games: number): Scenario {
  if (!(Number.isSafeInteger(games) && games > 0)) {
    throw new RangeError(`scenario: games must be a positive integer, got ${games}`);
  }
  return { ...s, seeds: { from: s.seeds.from, count: Math.ceil(games / s.lineups.length) } };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function posInt(v: unknown, what: string): number {
  if (!(typeof v === 'number' && Number.isSafeInteger(v) && v > 0)) {
    throw new TypeError(`scenario: ${what} must be a positive integer`);
  }
  return v;
}

function posNum(v: unknown, what: string): number {
  if (!(typeof v === 'number' && Number.isFinite(v) && v > 0)) {
    throw new TypeError(`scenario: ${what} must be a positive number`);
  }
  return v;
}

function parseLineups(v: unknown): string[][] {
  if (!(Array.isArray(v) && v.length > 0)) {
    throw new TypeError('scenario: lineups must be a non-empty array');
  }
  return v.map((l, i) => {
    if (!(Array.isArray(l) && l.length === 4 && l.every((d) => typeof d === 'string'))) {
      throw new TypeError(`scenario: lineups[${i}] must be 4 doctrine ids`);
    }
    return [...(l as string[])];
  });
}

function parseSeeds(v: unknown): { from: number; count: number } {
  if (!isRecord(v) || typeof v.from !== 'number' || !Number.isSafeInteger(v.from)) {
    throw new TypeError('scenario: seeds must be {from, count}');
  }
  return { from: v.from, count: posInt(v.count, 'seeds.count') };
}

const KNOWN_KEYS = new Set([
  'id',
  'mode',
  'seeds',
  'lineups',
  'reactionSeconds',
  'thinkSeconds',
  'maxTicks',
  'hashEvery',
]);

/**
 * Validates parsed JSON as a scenario. Only `id` and `lineups` are required; the rest falls back to
 * the `quick` values. Unknown keys throw, so typos do not pass silently.
 */
export function parseScenario(json: unknown): Scenario {
  if (!isRecord(json)) {
    throw new TypeError('scenario: expected a JSON object');
  }
  for (const key of Object.keys(json)) {
    if (!KNOWN_KEYS.has(key)) {
      throw new RangeError(`scenario: unknown key '${key}'`);
    }
  }
  if (typeof json.id !== 'string' || json.id === '') {
    throw new TypeError('scenario: id must be a non-empty string');
  }
  const mode = json.mode ?? QUICK.mode;
  if (mode !== 'director' && mode !== 'schedule') {
    throw new TypeError("scenario: mode must be 'director' or 'schedule'");
  }
  const num = (key: 'reactionSeconds' | 'thinkSeconds'): number =>
    json[key] === undefined ? QUICK[key] : posNum(json[key], key);
  const int = (key: 'maxTicks' | 'hashEvery'): number =>
    json[key] === undefined ? QUICK[key] : posInt(json[key], key);
  return {
    id: json.id,
    mode: mode as Mode,
    seeds: json.seeds === undefined ? QUICK.seeds : parseSeeds(json.seeds),
    lineups: parseLineups(json.lineups),
    reactionSeconds: num('reactionSeconds'),
    thinkSeconds: num('thinkSeconds'),
    maxTicks: int('maxTicks'),
    hashEvery: int('hashEvery'),
  };
}

/** `--scenario <name|file.json>`: a built-in by name, else a JSON file. */
export function loadScenario(nameOrPath: string): Scenario {
  if (nameOrPath === QUICK.id) {
    return QUICK;
  }
  if (nameOrPath === DEEP.id) {
    return DEEP;
  }
  let text: string;
  try {
    text = readFileSync(nameOrPath, 'utf8');
  } catch (error) {
    throw new Error(`scenario: cannot read '${nameOrPath}' (built-ins: quick, deep)`, { cause: error });
  }
  try {
    return parseScenario(JSON.parse(text));
  } catch (error) {
    throw new Error(`scenario: ${nameOrPath}: ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
}

/** The GameSpec of one game. */
export function specOf(s: Scenario, lineup: number, seed: number, overrides?: ConfigOverrides): GameSpec {
  return {
    abi: RUN_ABI,
    seed,
    mode: s.mode,
    doctrines: s.lineups[lineup] ?? [],
    reactionSeconds: s.reactionSeconds,
    thinkSeconds: s.thinkSeconds,
    maxTicks: s.maxTicks,
    hashEvery: s.hashEvery,
    ...(overrides === undefined ? {} : { overrides }),
  };
}
