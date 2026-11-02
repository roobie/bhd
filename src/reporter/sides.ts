// Sides: what `--base` / `--cand` mean. Parses the text, resolves refs to snapshots, reads the
// overrides file and fingerprints the code.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fingerprint } from '../../tools/fingerprint.ts';
import type { ConfigOverrides } from '../content/overrides.ts';
import { ensureSnapshot, git, resolveSha } from './snapshot.ts';
import type { ResolvedSide, SideSpec } from './types.ts';

const WORKTREE = 'WORKTREE';

/**
 * Parses a side: `WORKTREE`, `path.json` (worktree plus overrides), `ref:path.json` or a plain ref.
 * Refs cannot contain `:` in git, so the first one splits `ref:path.json`.
 */
export function parseSide(text: string): SideSpec {
  if (text.trim() === '') {
    throw new SyntaxError('side: empty; give a git ref, WORKTREE, path.json or ref:path.json');
  }
  const colon = text.indexOf(':');
  if (colon >= 0) {
    const ref = text.slice(0, colon);
    const path = text.slice(colon + 1);
    if (ref === '' || !path.endsWith('.json')) {
      throw new SyntaxError(`side '${text}': expected ref:path.json`);
    }
    return ref === WORKTREE ? { kind: 'overrides', path } : { kind: 'ref-overrides', ref, path };
  }
  if (text === WORKTREE) {
    return { kind: 'worktree' };
  }
  return text.endsWith('.json') ? { kind: 'overrides', path: text } : { kind: 'ref', ref: text };
}

function readOverrides(path: string, cwd: string): ConfigOverrides {
  const file = resolve(cwd, path);
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`overrides: cannot read '${file}': ${error instanceof Error ? error.message : String(error)}`, {
      cause: error,
    });
  }
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    throw new TypeError(`overrides: '${file}' must hold a JSON object {game?, bots?, director?}`);
  }
  return json as ConfigOverrides;
}

/** True when `src` or `index.html` of the working tree differ from HEAD (or have untracked files). */
function worktreeDirty(repo: string): boolean {
  return git(repo, 'status', '--porcelain', '--', 'src', 'index.html') !== '';
}

/**
 * Resolves one side to a directory of runnable code. `repo` is the repository root (worktree sides
 * run from it, refs snapshot into `<repo>/.bhd/snap/<sha>`); `cwd` resolves overrides paths.
 */
export function resolveSide(side: 'base' | 'cand', label: string, repo: string, cwd: string): ResolvedSide {
  const spec = parseSide(label);
  const overrides = 'path' in spec ? readOverrides(spec.path, cwd) : undefined;
  const withOverrides = overrides === undefined ? {} : { overrides };
  if ('ref' in spec) {
    const sha = resolveSha(repo, spec.ref);
    if (sha === undefined) {
      throw new Error(`${label}: '${spec.ref}' is not a git ref in ${repo}`);
    }
    const root = ensureSnapshot(repo, sha, label);
    return { side, label, ref: spec.ref, sha, dirty: false, fingerprint: fingerprint(root), root, ...withOverrides };
  }
  return {
    side,
    label,
    ref: WORKTREE,
    sha: git(repo, 'rev-parse', 'HEAD'),
    dirty: worktreeDirty(repo),
    fingerprint: fingerprint(repo),
    root: repo,
    ...withOverrides,
  };
}
