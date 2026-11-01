import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// DESIGN.md §6.1: detmath must not lean on engine-dependent or nondeterministic APIs.
const ROOT = 'src/detmath';
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//gu;
const NOT_NEWLINE = /[^\n]/gu;
const LINE_COMMENT = /\/\/.*$/u;
const BANNED =
  /\bMath\.(?:sin|cos|tan|asin|acos|atan|atan2|sinh|cosh|tanh|exp|expm1|log|log1p|log2|log10|pow|hypot|cbrt|random)\b|\bDate\b|\bperformance\.now\b|\*\*/u;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      return sources(p);
    }
    return p.endsWith('.ts') ? [p] : [];
  });
}

describe('detmath banned APIs', () => {
  const files = sources(ROOT);

  it('has sources to scan', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s uses no banned APIs', (file) => {
    const hits = readFileSync(file, 'utf8')
      // Blank out block comments, keeping line numbers.
      .replace(BLOCK_COMMENT, (c) => c.replace(NOT_NEWLINE, ' '))
      .split('\n')
      .map((line, i) => ({ line: line.replace(LINE_COMMENT, ''), n: i + 1 }))
      .filter(({ line }) => BANNED.test(line))
      .map(({ line, n }) => `${n}: ${line.trim()}`);
    expect(hits).toEqual([]);
  });
});
