// Source scan used by purity.test.ts: finds banned APIs and imports in deterministic code.
// DESIGN.md §6.1. Biome can't scope bans to folders, so this is the guard.

import { posix } from 'node:path';

/** Folders under src/ that must stay deterministic. */
export const PURE_DIRS = ['sim', 'detmath', 'perception', 'bots', 'intents', 'director', 'match', 'content', 'replay'];

/** Relative imports may only resolve into these (prefixes, repo-root relative). Packages are never allowed. */
const ALLOWED_IMPORT_PREFIXES = PURE_DIRS.map((d) => `src/${d}/`);

/**
 * The only `Math` members pure code may use: exact by IEEE 754 (or integer ops), identical on every
 * engine. The constants E, LN2, LN10, LOG2E, LOG10E, SQRT2, SQRT1_2 are "approximate" in the spec,
 * but every engine returns the same double in practice, so they are allowed.
 */
const MATH_ALLOWED = [
  'sqrt',
  'abs',
  'floor',
  'ceil',
  'round',
  'trunc',
  'min',
  'max',
  'imul',
  'sign',
  'fround',
  'clz32',
  'PI',
  'E',
  'SQRT2',
  'SQRT1_2',
  'LN2',
  'LN10',
  'LOG2E',
  'LOG10E',
];

const STRIP = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\[\s\S]|[^`\\])*`/gu;
const NOT_NEWLINE = /[^\n]/gu;
/** In a blanked template literal: `${…}` (non-nested) survives, the rest of the text is blanked. */
const TEMPLATE_PART = /\$\{[^}]*\}|[^\n]/gu;
const IMPORT_SPEC =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*|\bimport\s+)(?:"(?<dq>[^"\n]*)"|'(?<sq>[^'\n]*)')/gu;
/** import()/require() whose argument is not a string literal: the target can't be checked. */
const DYNAMIC_SPEC = /\b(?:import|require)\s*\(\s*(?!["'\s])/u;

// A bare global: not a property (`a.Date`, `{ Date: 1 }`) but still caught after a spread (`...Date`).
const GLOBAL_START = String.raw`(?<![\w$])(?<!(?<!\.\.)\.)`;
const GLOBAL_NAMES = [
  'Date',
  'performance',
  'document',
  'window',
  'navigator',
  'localStorage',
  'sessionStorage',
  'requestAnimationFrame',
  'setTimeout',
  'setInterval',
  'crypto',
  'Intl',
  'process',
  'self',
  'globalThis',
  'WeakRef',
  'FinalizationRegistry',
  'eval',
  'Function',
  'fetch',
  'queueMicrotask',
  'setImmediate',
  'requestIdleCallback',
  'Atomics',
  'SharedArrayBuffer',
  'Worker',
  'location',
];

const NAMES = GLOBAL_NAMES.join('|');

const BANNED_CODE = new RegExp(
  [
    // Any use of Math other than `Math.<allowed member>`: destructuring, Math['sin'], aliasing, Math?.sin.
    String.raw`${GLOBAL_START}Math(?![\w$])(?!\s*\.\s*(?:${MATH_ALLOWED.join('|')})(?![\w$]))`,
    // A name followed by `:` is exempt only as an object key (after `{` or `,`); `c ? Date : 0` and `case Date:` are not.
    `${GLOBAL_START}(?:(?<![{,]\\s*)(?:${NAMES})(?![\\w$])|(?<=[{,]\\s*)(?:${NAMES})(?![\\w$])(?!\\s*:))`,
    // Dynamic code and the Function constructor, however it's reached.
    String.raw`(?<=\.\s*)constructor(?![\w$])`,
    String.raw`\bimport\s*\.\s*meta\b`,
    // Message passing and event wiring, even as methods (`self.postMessage`, `el.addEventListener`).
    String.raw`\b(?:postMessage|addEventListener)\b`,
    String.raw`\*\*`,
    // Locale-dependent behaviour, however it's reached.
    String.raw`\blocaleCompare\b`,
    String.raw`\btoLocale\w*`,
  ].join('|'),
  'gu',
);

/** Blanks comments, string contents and template text, keeping line numbers and offsets. `${…}` stays visible. */
function blank(src: string): string {
  return src.replace(STRIP, (m) => {
    if (m.startsWith('`')) {
      return m.replace(TEMPLATE_PART, (t) => (t.length > 1 ? t : ' '));
    }
    return m.replace(NOT_NEWLINE, ' ');
  });
}

/** Blanks comments only (strings stay, so import specifiers are visible). */
function blankKeepingStrings(src: string): string {
  return src.replace(STRIP, (m) => (m.startsWith('//') || m.startsWith('/*') ? m.replace(NOT_NEWLINE, ' ') : m));
}

function importAllowed(spec: string, file: string): boolean {
  if (!spec.startsWith('.')) {
    return false;
  }
  const target = posix.join(posix.dirname(file), spec);
  return ALLOWED_IMPORT_PREFIXES.some((p) => target.startsWith(p));
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length - 1;
}

/**
 * `line: text` for each violation in `src`, a file at repo-root-relative path `file`
 * (relative imports are resolved against it).
 */
export function scan(src: string, file = 'src/sim/x.ts'): string[] {
  const lines = src.split('\n');
  const hits = new Set<number>();
  const code = blank(src);
  for (const m of code.matchAll(BANNED_CODE)) {
    hits.add(lineOf(code, m.index));
  }
  const live = blankKeepingStrings(src);
  for (const m of live.matchAll(IMPORT_SPEC)) {
    const spec = m.groups?.dq ?? m.groups?.sq ?? '';
    if (!importAllowed(spec, file)) {
      hits.add(lineOf(live, m.index));
    }
  }
  for (const m of live.matchAll(new RegExp(DYNAMIC_SPEC, 'gu'))) {
    hits.add(lineOf(live, m.index));
  }
  return [...hits].sort((a, b) => a - b).map((i) => `${i + 1}: ${lines[i]?.trim()}`);
}
