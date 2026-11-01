import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The reporter is a Node CLI built on the game, never the other way round (wave w3-reporter DESIGN):
// nothing outside src/reporter/ (and its tests) may import from it.

const ROOTS = ['src', 'worker', 'test', 'index.html', 'vite.config.ts'];
const OWN = ['src/reporter', 'test/reporter'];
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|html)$/u;
const REPORTER_SPEC = /(?:from\s*|import\s*\(?\s*)['"][^'"]*\/reporter(?:\/[^'"]*)?['"]/u;

function files(path: string): string[] {
  if (!existsSync(path) || OWN.includes(path.split('\\').join('/'))) {
    return [];
  }
  if (statSync(path).isDirectory()) {
    return readdirSync(path).flatMap((name) => files(join(path, name)));
  }
  return SOURCE_FILE.test(path) ? [path] : [];
}

describe('reporter layering', () => {
  it('flags an import of the reporter', () => {
    expect(REPORTER_SPEC.test("import { x } from '../reporter/types.ts';")).toBe(true);
    expect(REPORTER_SPEC.test("const m = await import('../../src/reporter/cli.ts');")).toBe(true);
    expect(REPORTER_SPEC.test("import { x } from '../match/run.ts';")).toBe(false);
  });

  it('scans something', () => {
    expect(ROOTS.flatMap(files).length).toBeGreaterThan(10);
  });

  it('nothing outside src/reporter imports from it', () => {
    const bad = ROOTS.flatMap(files).filter((f) => REPORTER_SPEC.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
});
