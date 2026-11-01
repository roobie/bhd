import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { DEEP, gamesOf, loadScenario, parseScenario, QUICK, specOf, withGames } from '../../src/reporter/scenarios.ts';
import { fingerprint, parseSide, resolveSide } from '../../src/reporter/sides.ts';
import { checkRunAbi, git, repoRoot } from '../../src/reporter/snapshot.ts';
import { batchKey, runKey, stableStringify } from '../../src/reporter/store.ts';
import type { ResolvedSide } from '../../src/reporter/types.ts';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TMP = mkdtempSync(join(tmpdir(), 'bhd-sides-'));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe('parseSide', () => {
  it('reads a plain ref', () => {
    expect(parseSide('main')).toEqual({ kind: 'ref', ref: 'main' });
    expect(parseSide('feature/x-1')).toEqual({ kind: 'ref', ref: 'feature/x-1' });
    expect(parseSide('abc1234')).toEqual({ kind: 'ref', ref: 'abc1234' });
  });

  it('reads WORKTREE', () => {
    expect(parseSide('WORKTREE')).toEqual({ kind: 'worktree' });
  });

  it('reads a json path as worktree plus overrides', () => {
    expect(parseSide('tweak.json')).toEqual({ kind: 'overrides', path: 'tweak.json' });
    expect(parseSide('dir/tweak.json')).toEqual({ kind: 'overrides', path: 'dir/tweak.json' });
  });

  it('reads ref:json', () => {
    expect(parseSide('main:tweak.json')).toEqual({ kind: 'ref-overrides', ref: 'main', path: 'tweak.json' });
    expect(parseSide('WORKTREE:tweak.json')).toEqual({ kind: 'overrides', path: 'tweak.json' });
  });

  it('rejects empty and malformed sides', () => {
    expect(() => parseSide('')).toThrow(SyntaxError);
    expect(() => parseSide('main:')).toThrow(SyntaxError);
    expect(() => parseSide('main:notjson.txt')).toThrow(SyntaxError);
    expect(() => parseSide(':x.json')).toThrow(SyntaxError);
  });
});

describe('cache keys', () => {
  const spec = specOf(QUICK, 0, 1);

  it('is stable and depends on the fingerprint and every spec field', () => {
    expect(runKey('fp', spec)).toBe(runKey('fp', { ...spec }));
    expect(runKey('fp', spec)).not.toBe(runKey('fp2', spec));
    expect(runKey('fp', spec)).not.toBe(runKey('fp', { ...spec, seed: 2 }));
    expect(runKey('fp', spec)).not.toBe(runKey('fp', { ...spec, maxTicks: 10 }));
    expect(runKey('fp', spec)).not.toBe(runKey('fp', { ...spec, overrides: { game: {} } }));
  });

  it('does not depend on object key order', () => {
    const a = { ...spec, overrides: { game: { a: 1, b: 2 } } };
    const b = { ...spec, overrides: { game: { b: 2, a: 1 } } };
    expect(runKey('fp', a)).toBe(runKey('fp', b));
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });

  it('keys a batch on the scenario and both sides', () => {
    const side = (fp: string, overrides?: ResolvedSide['overrides']): ResolvedSide => ({
      side: 'base',
      label: 'x',
      ref: 'x',
      sha: 's',
      dirty: false,
      fingerprint: fp,
      root: '/r',
      ...(overrides === undefined ? {} : { overrides }),
    });
    const k = batchKey(QUICK, side('a'), side('b'));
    expect(k).toBe(batchKey(QUICK, side('a'), side('b')));
    expect(k).not.toBe(batchKey(DEEP, side('a'), side('b')));
    expect(k).not.toBe(batchKey(QUICK, side('a'), side('c')));
    expect(k).not.toBe(batchKey(QUICK, side('a'), side('b', { game: {} })));
  });
});

describe('scenarios', () => {
  it('ships quick (100 games) and deep (2,000 games)', () => {
    expect(gamesOf(QUICK)).toBe(100);
    expect(gamesOf(DEEP)).toBe(2000);
    expect(gamesOf(withGames(QUICK, 21))).toBe(22);
  });

  it('loads a custom scenario, defaulting the unset fields to quick', () => {
    const file = join(TMP, 's.json');
    writeFileSync(file, JSON.stringify({ id: 'mine', lineups: [['a', 'b', 'c', 'd']], maxTicks: 50 }));
    const s = loadScenario(file);
    expect(s).toMatchObject({ id: 'mine', mode: 'director', maxTicks: 50, hashEvery: QUICK.hashEvery });
  });

  it('rejects unknown keys, bad lineups and missing files', () => {
    expect(() => parseScenario({ id: 'x', lineups: [['a']] })).toThrow(TypeError);
    expect(() => parseScenario({ id: 'x', lineups: [['a', 'b', 'c', 'd']], gaems: 3 })).toThrow(RangeError);
    expect(() => parseScenario({ lineups: [['a', 'b', 'c', 'd']] })).toThrow(TypeError);
    expect(() => loadScenario(join(TMP, 'missing.json'))).toThrow('cannot read');
  });
});

describe('resolveSide', () => {
  it('resolves WORKTREE to the repo with a fingerprint of its pure dirs', () => {
    const repo = repoRoot(ROOT);
    const s = resolveSide('cand', 'WORKTREE', repo, ROOT);
    expect(s).toMatchObject({ side: 'cand', ref: 'WORKTREE', root: repo });
    expect(s.sha).toHaveLength(40);
    expect(s.fingerprint).toBe(fingerprint(repo));
    expect(s.overrides).toBeUndefined();
  });

  it('attaches parsed overrides and rejects a non-object file', () => {
    const repo = repoRoot(ROOT);
    writeFileSync(join(TMP, 'o.json'), '{"game":{}}');
    expect(resolveSide('base', join(TMP, 'o.json'), repo, ROOT).overrides).toEqual({ game: {} });
    writeFileSync(join(TMP, 'bad.json'), '[1]');
    expect(() => resolveSide('base', join(TMP, 'bad.json'), repo, ROOT)).toThrow('JSON object');
  });

  it('snapshots a ref into .bhd/snap/<sha> and reuses it', () => {
    const repo = repoRoot(ROOT);
    const a = resolveSide('base', 'HEAD', repo, ROOT);
    expect(a.root).toBe(join(repo, '.bhd', 'snap', a.sha));
    expect(existsSync(join(a.root, 'src', 'match', 'run.ts'))).toBe(true);
    expect(a).toMatchObject({ ref: 'HEAD', dirty: false, fingerprint: fingerprint(a.root) });
    expect(resolveSide('cand', 'HEAD', repo, ROOT).fingerprint).toBe(a.fingerprint);
  });

  it('rejects a ref that is not in the repo, and a commit with no run.ts', () => {
    const repo = repoRoot(ROOT);
    expect(() => resolveSide('base', 'no-such-ref-xyz', repo, ROOT)).toThrow('not a git ref');
    // A shallow clone (CI) has no root commit that predates run.ts.
    if (git(repo, 'rev-parse', '--is-shallow-repository').trim() === 'true') {
      return;
    }
    const root = git(repo, 'rev-list', '--max-parents=0', 'HEAD').split('\n')[0] ?? '';
    expect(() => checkRunAbi(repo, root, 'base')).toThrow('predates');
  });
});
