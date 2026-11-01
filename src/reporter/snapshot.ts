// Git snapshots: a ref becomes a directory `.bhd/snap/<sha>` holding `src` and `index.html`, made
// with `git archive`. Snapshots are immutable and cached by sha.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { RUN_ABI } from '../match/run.ts';

const RUN_FILE = 'src/match/run.ts';
const ABI_DECL = /export\s+const\s+RUN_ABI\s*=\s*(?<abi>\d+)/u;
const MAX_ARCHIVE = 256 * 1024 * 1024;

/** Runs plain `git` in `cwd` and returns trimmed stdout; a failure carries git's own message. */
export function git(cwd: string, ...args: string[]): string {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    const { stderr } = error as { stderr?: unknown };
    const detail = typeof stderr === 'string' && stderr.trim() !== '' ? stderr.trim() : String(error);
    throw new Error(`git ${args.join(' ')}: ${detail}`, { cause: error });
  }
}

/** The repository root containing `cwd`. */
export function repoRoot(cwd: string): string {
  return git(cwd, 'rev-parse', '--show-toplevel');
}

/** The commit a ref names. */
export function resolveSha(repo: string, ref: string): string | undefined {
  try {
    return git(repo, 'rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  } catch {
    return undefined;
  }
}

function fileAt(repo: string, sha: string, path: string): string | undefined {
  try {
    return execFileSync('git', ['show', `${sha}:${path}`], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return undefined;
  }
}

/** Throws unless the commit has `src/match/run.ts` exporting the `RUN_ABI` this runner speaks. */
export function checkRunAbi(repo: string, sha: string, label: string): void {
  const src = fileAt(repo, sha, RUN_FILE);
  if (src === undefined) {
    throw new Error(`${label}: ${sha.slice(0, 8)} has no ${RUN_FILE}; it predates the reporter and cannot be run`);
  }
  const abi = ABI_DECL.exec(src)?.groups?.abi;
  if (abi === undefined || Number(abi) !== RUN_ABI) {
    throw new Error(`${label}: ${sha.slice(0, 8)} has RUN_ABI ${abi ?? 'none'}, this reporter needs ${RUN_ABI}`);
  }
}

/** Where a sha's snapshot lives. */
function snapshotDir(repo: string, sha: string): string {
  return join(repo, '.bhd', 'snap', sha);
}

/**
 * The directory holding commit `sha`'s code, made with `git archive` on first use. It is extracted
 * beside its final place and renamed, so a crashed run leaves no half snapshot.
 */
export function ensureSnapshot(repo: string, sha: string, label: string): string {
  checkRunAbi(repo, sha, label);
  const dir = snapshotDir(repo, sha);
  if (existsSync(join(dir, RUN_FILE))) {
    return dir;
  }
  const paths = ['src', ...(fileAt(repo, sha, 'index.html') === undefined ? [] : ['index.html'])];
  const archive = spawnSync('git', ['archive', sha, ...paths], { cwd: repo, maxBuffer: MAX_ARCHIVE });
  if (archive.status !== 0) {
    throw new Error(`${label}: git archive ${sha}: ${archive.stderr.toString().trim()}`);
  }
  const tmp = `${dir}.${process.pid}.tmp`;
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const untar = spawnSync('tar', ['-x', '-C', tmp], { input: archive.stdout });
  if (untar.status !== 0) {
    rmSync(tmp, { recursive: true, force: true });
    throw new Error(`${label}: tar: ${untar.stderr.toString().trim()}`);
  }
  try {
    renameSync(tmp, dir);
  } catch (error) {
    // Another process finished the same snapshot first; theirs is identical.
    rmSync(tmp, { recursive: true, force: true });
    if (!existsSync(join(dir, RUN_FILE))) {
      throw error;
    }
  }
  return dir;
}
