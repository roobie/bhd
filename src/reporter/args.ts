// Pure command-line parsing for `bhd` (no fs, no process). Errors come back as values, never throws.

import { parseArgs } from 'node:util';
import { parseSide } from './sides.ts';
import type { SideSpec } from './types.ts';

const DIGITS = /^\d+$/u;
export const DEFAULT_GAMES = 100;
export const DEEP_GAMES = 2000;

export const USAGE = `usage: bhd <command> [options]

commands:
  report --base <side> [--cand <side>] [--tag <area>]... [--games <n> | --deep]
         [--workers <n>] [--scenario <file.json>] [--out <dir>]
      Play both sides on the same seeds, write report.json and index.html, print a summary table.
  run --side <side> [--games <n>] [--scenario <file.json>] [--workers <n>]
      Play one side and print its outcome distribution, waves reached, ms/game and distinct games.
  view <log.ndjson.gz> [--tick <t>]
      Open a logged game in the viewer, paused at tick t.
  clean
      Remove .bhd/runs and .bhd/snap (reports are kept).
  help
      Show this text.

a <side> is one of:
  <ref>              a git ref (branch, tag, sha)
  WORKTREE           the working tree as it is (the default for --cand)
  <file>.json        the working tree plus an overrides file
  <ref>:<file>.json  a ref plus an overrides file

--games defaults to ${DEFAULT_GAMES}; --deep is ${DEEP_GAMES} games. --scenario replaces the built-in lineups and seeds (and --games).
exit codes: 0 ok, 1 failure, 2 usage error`;

export interface ReportCommand {
  readonly cmd: 'report';
  readonly base: SideSpec;
  readonly cand: SideSpec;
  readonly tags: readonly string[];
  /** Games per side. */
  readonly games: number;
  readonly deep: boolean;
  readonly workers?: number;
  readonly scenario?: string;
  readonly out?: string;
}

export interface RunCommand {
  readonly cmd: 'run';
  readonly side: SideSpec;
  readonly games: number;
  readonly workers?: number;
  readonly scenario?: string;
}

interface ViewCommand {
  readonly cmd: 'view';
  readonly log: string;
  readonly tick?: number;
}

export type Command = ReportCommand | RunCommand | ViewCommand | { readonly cmd: 'clean' } | { readonly cmd: 'help' };

export type ParseResult =
  | { readonly ok: true; readonly command: Command }
  | { readonly ok: false; readonly message: string };

const fail = (message: string): ParseResult => ({ ok: false, message: `${message}\n\n${USAGE}` });
const good = (command: Command): ParseResult => ({ ok: true, command });

/** A non-negative integer >= min, or an error message. */
function parseCount(text: string | undefined, name: string, min: number): number | string | undefined {
  if (text === undefined) {
    return undefined;
  }
  const n = Number(text);
  return DIGITS.test(text) && Number.isSafeInteger(n) && n >= min ? n : `${name} must be an integer >= ${min}`;
}

const OPTIONS = {
  base: { type: 'string' },
  cand: { type: 'string' },
  side: { type: 'string' },
  tag: { type: 'string', multiple: true },
  games: { type: 'string' },
  deep: { type: 'boolean' },
  workers: { type: 'string' },
  scenario: { type: 'string' },
  out: { type: 'string' },
  tick: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const;

type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>['values'];

/** The first option that the command does not take, as an error message. */
function unexpected(values: Values, names: readonly string[]): string | undefined {
  const extra = Object.keys(values).find((k) => k !== 'help' && !names.includes(k));
  return extra === undefined ? undefined : `unexpected option --${extra}`;
}

function sideOption(text: string | undefined, name: string): SideSpec | string {
  if (text === undefined) {
    return `--${name} is required`;
  }
  try {
    return parseSide(text);
  } catch (error) {
    return `--${name}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function parseReport(values: Values): ParseResult {
  const extra = unexpected(values, ['base', 'cand', 'tag', 'games', 'deep', 'workers', 'scenario', 'out']);
  const base = sideOption(values.base, 'base');
  const cand = sideOption(values.cand ?? 'WORKTREE', 'cand');
  const games = parseCount(values.games, '--games', 1);
  const workers = parseCount(values.workers, '--workers', 1);
  const deep = values.deep === true;
  const error = [extra, base, cand, games, workers].find((v) => typeof v === 'string');
  if (error !== undefined) {
    return fail(error as string);
  }
  if (deep && values.games !== undefined) {
    return fail('--games and --deep are mutually exclusive');
  }
  return good({
    cmd: 'report',
    base: base as SideSpec,
    cand: cand as SideSpec,
    tags: values.tag ?? [],
    games: (games as number | undefined) ?? (deep ? DEEP_GAMES : DEFAULT_GAMES),
    deep,
    ...(workers === undefined ? {} : { workers: workers as number }),
    ...(values.scenario === undefined ? {} : { scenario: values.scenario }),
    ...(values.out === undefined ? {} : { out: values.out }),
  });
}

function parseRun(values: Values): ParseResult {
  const extra = unexpected(values, ['side', 'games', 'workers', 'scenario']);
  const side = sideOption(values.side, 'side');
  const games = parseCount(values.games, '--games', 1);
  const workers = parseCount(values.workers, '--workers', 1);
  const error = [extra, side, games, workers].find((v) => typeof v === 'string');
  if (error !== undefined) {
    return fail(error as string);
  }
  return good({
    cmd: 'run',
    side: side as SideSpec,
    games: (games as number | undefined) ?? DEFAULT_GAMES,
    ...(workers === undefined ? {} : { workers: workers as number }),
    ...(values.scenario === undefined ? {} : { scenario: values.scenario }),
  });
}

function parseView(values: Values, positionals: readonly string[]): ParseResult {
  const extra = unexpected(values, ['tick']);
  if (extra !== undefined) {
    return fail(extra);
  }
  const [log, ...rest] = positionals;
  if (log === undefined || rest.length > 0) {
    return fail('view takes exactly one log path');
  }
  const tick = parseCount(values.tick, '--tick', 0);
  if (typeof tick === 'string') {
    return fail(tick);
  }
  return good({ cmd: 'view', log, ...(tick === undefined ? {} : { tick }) });
}

/** Parses `process.argv.slice(2)`. No arguments, `help` and `--help` all mean help. */
export function parseCli(argv: readonly string[]): ParseResult {
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>;
  try {
    parsed = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  const [name, ...rest] = positionals;
  if (name === undefined || name === 'help' || values.help === true) {
    return good({ cmd: 'help' });
  }
  if (name === 'view') {
    return parseView(values, rest);
  }
  if (rest.length > 0) {
    return fail(`unexpected argument '${rest[0]}'`);
  }
  switch (name) {
    case 'report':
      return parseReport(values);
    case 'run':
      return parseRun(values);
    case 'clean':
      return unexpected(values, []) === undefined ? good({ cmd: 'clean' }) : fail('clean takes no options');
    default:
      return fail(`unknown command '${name}'`);
  }
}
