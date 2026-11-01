// parseCli: good input is accepted, bad input comes back as a usage message, defaults are filled in.
// Pure argument parsing; no gameplay.

import { describe, expect, it } from 'vitest';
import type { Command } from '../../src/reporter/args.ts';
import { DEEP_GAMES, DEFAULT_GAMES, parseCli, parseSideSpec } from '../../src/reporter/args.ts';
import { progressLine } from '../../src/reporter/commands.ts';

function ok(argv: string[]): Command {
  const result = parseCli(argv);
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.command;
}

function rejected(argv: string[]): string {
  const result = parseCli(argv);
  return result.ok ? 'ACCEPTED' : result.message;
}

describe('parseSideSpec', () => {
  it('reads the four side forms', () => {
    expect(parseSideSpec('main')).toEqual({ kind: 'ref', ref: 'main' });
    expect(parseSideSpec('WORKTREE')).toEqual({ kind: 'worktree' });
    expect(parseSideSpec('o.json')).toEqual({ kind: 'overrides', path: 'o.json' });
    expect(parseSideSpec('v1:dir/o.json')).toEqual({ kind: 'ref-overrides', ref: 'v1', path: 'dir/o.json' });
  });

  it('rejects empty parts', () => {
    expect(parseSideSpec('')).toBeUndefined();
    expect(parseSideSpec(':o.json')).toBeUndefined();
  });
});

describe('parseCli report', () => {
  it('fills defaults', () => {
    expect(ok(['report', '--base', 'main'])).toEqual({
      cmd: 'report',
      base: { kind: 'ref', ref: 'main' },
      cand: { kind: 'worktree' },
      tags: [],
      games: DEFAULT_GAMES,
      deep: false,
    });
  });

  it('takes repeated tags and every option', () => {
    expect(
      ok([
        'report',
        '--base',
        'a',
        '--cand',
        'b.json',
        '--tag',
        'x',
        '--tag',
        'y.z',
        '--games',
        '40',
        '--workers',
        '3',
        '--scenario',
        's.json',
        '--out',
        'o',
      ]),
    ).toEqual({
      cmd: 'report',
      base: { kind: 'ref', ref: 'a' },
      cand: { kind: 'overrides', path: 'b.json' },
      tags: ['x', 'y.z'],
      games: 40,
      deep: false,
      workers: 3,
      scenario: 's.json',
      out: 'o',
    });
  });

  it('--deep sets the deep game count', () => {
    expect(ok(['report', '--base', 'a', '--deep'])).toMatchObject({ deep: true, games: DEEP_GAMES });
  });

  it('rejects bad input with the usage text', () => {
    expect(rejected(['report'])).toContain('--base is required');
    expect(rejected(['report', '--base', 'a', '--games', '0'])).toContain('--games');
    expect(rejected(['report', '--base', 'a', '--games', '1.5'])).toContain('--games');
    expect(rejected(['report', '--base', 'a', '--workers', 'x'])).toContain('--workers');
    expect(rejected(['report', '--base', 'a', '--deep', '--games', '5'])).toContain('mutually exclusive');
    expect(rejected(['report', '--base', ':x.json'])).toContain('not a side');
    expect(rejected(['report', '--base', 'a', '--side', 'b'])).toContain('--side');
    expect(rejected(['report', '--base', 'a', '--bogus'])).toContain('usage:');
    expect(rejected(['report', 'extra', '--base', 'a'])).toContain('extra');
  });
});

describe('parseCli other commands', () => {
  it('run', () => {
    expect(ok(['run', '--side', 'WORKTREE'])).toEqual({ cmd: 'run', side: { kind: 'worktree' }, games: DEFAULT_GAMES });
    expect(ok(['run', '--side', 'a', '--games', '7', '--scenario', 's.json'])).toMatchObject({
      games: 7,
      scenario: 's.json',
    });
    expect(rejected(['run'])).toContain('--side is required');
    expect(rejected(['run', '--side', 'a', '--base', 'b'])).toContain('--base');
  });

  it('view', () => {
    expect(ok(['view', 'g.ndjson.gz'])).toEqual({ cmd: 'view', log: 'g.ndjson.gz' });
    expect(ok(['view', 'g.ndjson.gz', '--tick', '120'])).toEqual({ cmd: 'view', log: 'g.ndjson.gz', tick: 120 });
    expect(rejected(['view'])).toContain('exactly one log');
    expect(rejected(['view', 'a', 'b'])).toContain('exactly one log');
    expect(rejected(['view', 'a', '--tick', '-3'])).toContain('--tick');
  });

  it('clean and help', () => {
    expect(ok(['clean'])).toEqual({ cmd: 'clean' });
    expect(rejected(['clean', '--deep'])).toContain('clean takes no options');
    expect(ok(['help'])).toEqual({ cmd: 'help' });
    expect(ok(['--help'])).toEqual({ cmd: 'help' });
    expect(ok([])).toEqual({ cmd: 'help' });
  });

  it('rejects an unknown command', () => {
    expect(rejected(['frobnicate'])).toContain("unknown command 'frobnicate'");
  });
});

describe('progressLine', () => {
  it('shows done/total and an ETA while running', () => {
    expect(progressLine(0, 10, 0)).toBe('games 0/10');
    expect(progressLine(5, 10, 5000)).toBe('games 5/10  eta 5s');
    expect(progressLine(10, 10, 9000)).toBe('games 10/10');
  });
});
