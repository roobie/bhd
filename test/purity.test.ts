import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PURE_DIRS, scan } from './purity-scan.ts';

// Must exist and hold code, so a typo or a move can't turn the scan vacuous. The others may be absent.
const REQUIRED_DIRS = ['sim', 'detmath'];
const OPTIONAL_DIRS = PURE_DIRS.filter((d) => !REQUIRED_DIRS.includes(d));

const SOURCE_FILE = /\.[cm]?[jt]sx?$/u;

function sources(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      return sources(p);
    }
    return SOURCE_FILE.test(e.name) ? [p] : [];
  });
}

// Each snippet must be flagged exactly once (one line).
const MUST_FLAG: readonly (readonly [string, string])[] = [
  ['Math.sin call', 'const a = Math.sin(1);'],
  ['Math.random call', 'const t = Math.random();'],
  ['Math destructuring', 'const { sin } = Math;'],
  ['Math aliasing', 'const M = Math;'],
  ['Math computed member', "const f = Math['sin'];"],
  ['Math optional chain', 'const f = Math?.sin;'],
  ['Math spaced member', 'const f = Math . cos;'],
  ['Date.now', 'const b = Date.now();'],
  ['Date in template expression', ['const s = `t=$', '{Date.now()}`;'].join('')],
  ['Date after spread', 'f(...Date);'],
  ['Date as a ternary branch', 'const d = c ? Date : 0;'],
  ['Date as a case label', 'switch (x) {\n case Date:\n break;\n}'],
  ['global as a ternary branch after a brace', 'const d = { a: c ? self : 0 };'],
  ['eval', 'eval(code);'],
  ['Function constructor', "const f = new Function('return 1');"],
  ['constructor access', 'const f = (0).constructor.constructor(c);'],
  ['optional constructor access', 'const f = x?.constructor;'],
  ['fetch', 'await fetch(u);'],
  ['queueMicrotask', 'queueMicrotask(f);'],
  ['setImmediate', 'setImmediate(f);'],
  ['requestIdleCallback', 'requestIdleCallback(f);'],
  ['requestAnimationFrame', 'requestAnimationFrame(f);'],
  ['setInterval', 'setInterval(f, 1);'],
  ['Atomics', 'Atomics.wait(a, 0, 0);'],
  ['SharedArrayBuffer', 'new SharedArrayBuffer(8);'],
  ['Worker', "new Worker('w.js');"],
  ['postMessage as a method', 'port.postMessage(1);'],
  ['addEventListener as a method', 'el.addEventListener(e, f);'],
  ['location', 'const l = location;'],
  ['import.meta', 'const u = import.meta.url;'],
  ['exponent operator', 'const c = 2 ** 3;'],
  ['exponent assignment', 'x **= 2;'],
  ['performance', 'performance.now();'],
  ['setTimeout', 'setTimeout(f, 1);'],
  ['window', 'const w = window;'],
  ['crypto', 'crypto.getRandomValues(a);'],
  ['Intl', 'new Intl.NumberFormat();'],
  ['localeCompare', 'a.localeCompare(b);'],
  ['toLocaleString', 'n.toLocaleString();'],
  ['process', 'process.exit(1);'],
  ['self', 'self.postMessage(1);'],
  ['globalThis', 'globalThis.x = 1;'],
  ['WeakRef', 'const r = new WeakRef(o);'],
  ['FinalizationRegistry', 'new FinalizationRegistry(f);'],
  ['node: import', "import fs from 'node:fs';"],
  ['client import', "import { v } from '../client/main.ts';"],
  ['package import', "import { html } from 'lit-html';"],
  ['any bare specifier', "import { x } from 'some-pkg';"],
  ['side-effect import', "import 'some-pkg';"],
  ['re-export from a package', "export { x } from 'some-pkg';"],
  ['dynamic import of a forbidden dir', "const m = await import('../net/x.ts');"],
  ['dynamic import of a computed path', 'const m = await import(path);'],
  ['require of a package', "const m = require('fs');"],
  ['relative import out of the pure dirs', "import { x } from '../../test/x.ts';"],
];

// Each snippet must pass.
const MUST_PASS: readonly (readonly [string, string])[] = [
  ['allowed Math members', 'const a = Math.sqrt(Math.abs(Math.floor(Math.PI)) + Math.imul(2, 3) + Math.max(1, 2));'],
  ['Math member after a line break', 'const a = Math\n  .floor(1.5);'],
  ['comments', '// Math.sin and Date and 2 ** 3\n/* window\n document */'],
  ['string contents', 'const s = \'Math.random() ** 2\'; const q = "performance";'],
  ['template text', ['const t = `Date $', '{1} setTimeout Math.sin`;'].join('')],
  ['template expression without a banned name', ['const t = `n=$', '{Math.floor(x)}`;'].join('')],
  ['property named like a global', 'const a = o.Date + o.window + o.self + o?.process;'],
  ['object keys named like globals', 'const o = { Date: 1, self: 2, process: 3 };'],
  ['object keys on separate lines', 'const o = {\n  a: 1,\n  Date : 2,\n  eval: 3,\n};'],
  ['class constructor', 'class A {\n  constructor() {}\n}'],
  ['property named fetch or location', 'const a = o.fetch + o.location + o.Worker;'],
  ['identifier containing a banned name', 'const dateMath = Mathematics + selfie + processed + MyDate;'],
  ['sibling import', "import { x } from './entities.ts';"],
  ['import of another pure dir', "import { y } from '../detmath/index.ts';"],
  ['import of content', "import { z } from '../content/units.ts';"],
  ['re-export of a sibling', "export { x } from './entities.ts';"],
  ['dynamic import of a pure sibling', "const m = await import('./entities.ts');"],
];

describe('purity scan', () => {
  it.each(MUST_FLAG)('flags: %s', (_name, snippet) => {
    expect(scan(snippet)).toHaveLength(1);
  });

  it.each(MUST_PASS)('passes: %s', (_name, snippet) => {
    expect(scan(snippet)).toEqual([]);
  });

  it('reports the line number and text', () => {
    expect(scan('a\nb\nconst t = Math.random();')).toEqual(['3: const t = Math.random();']);
  });

  it('resolves relative imports against the file location', () => {
    expect(scan("import { x } from './x.ts';", 'src/sim/deep/y.ts')).toEqual([]);
    expect(scan("import { x } from '../x.ts';", 'src/sim/deep/y.ts')).toEqual([]);
    expect(scan("import { x } from '../../x.ts';", 'src/sim/deep/y.ts')).toHaveLength(1);
  });

  it.each(REQUIRED_DIRS)('src/%s exists and has sources', (dir) => {
    expect(sources(join('src', dir)).length).toBeGreaterThan(0);
  });

  // One test per folder; the optional ones may be absent or empty.
  it.each([...REQUIRED_DIRS, ...OPTIONAL_DIRS])('src/%s is pure', (dir) => {
    const root = join('src', dir);
    const hits = sources(root).flatMap((file) =>
      scan(readFileSync(file, 'utf8'), file.split('\\').join('/')).map((h) => `${file}:${h}`),
    );
    expect(hits).toEqual([]);
  });
});
