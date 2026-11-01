import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { describe, expect, it } from 'vitest';

// Bots and the Director only issue commands (wave w2-bots DESIGN "Bots run outside the sim step"):
// from sim/ they may import only the command and event shapes (as types) and time conversion
// (ticks(), a pure function of constants; adjusted from the design's "commands.ts and events.ts only").
// They may also type-import the perception shapes (perception/types.ts), but never perception's
// computation, and never anything from match/ or intents/ (Match drives them, not the other way).

const DIRS = ['bots', 'director'];
const ALLOWED_VALUE = new Set(['src/sim/time.ts']);
const ALLOWED_TYPE = new Set([
  'src/sim/commands.ts',
  'src/sim/events.ts',
  'src/sim/time.ts',
  'src/perception/types.ts',
]);
/** Layers that bots and the Director may only reach through the allow-lists above. */
const GUARDED = ['src/sim/', 'src/perception/', 'src/match/', 'src/intents/'];
const SOURCE_FILE = /\.ts$/u;
const IMPORT =
  /(?:^|\n)\s*(?<kind>import|export)\s+(?<type>type\s+)?(?<body>[^;]*?)\s*from\s*['"](?<spec>[^'"]+)['"]/gu;
const SIDE_EFFECT = /(?:^|\n)\s*import\s*['"](?<spec>[^'"]+)['"]/gu;
const DYNAMIC = /\bimport\s*\(\s*['"](?<spec>[^'"]+)['"]/gu;
const INLINE_TYPE_ONLY = /^\{\s*(?:type\s+[^,}]+,?\s*)+\}$/u;

interface Use {
  readonly target: string;
  readonly typeOnly: boolean;
}

/** Imports of `source` (a file at `file`) that resolve into a guarded layer. */
function guardedImports(source: string, file: string): Use[] {
  const uses: Use[] = [];
  const add = (spec: string, typeOnly: boolean): void => {
    if (!spec.startsWith('.')) {
      return;
    }
    const target = posix.normalize(posix.join(posix.dirname(file), spec));
    if (GUARDED.some((g) => target.startsWith(g))) {
      uses.push({ target, typeOnly });
    }
  };
  for (const m of source.matchAll(IMPORT)) {
    const { spec = '', body = '' } = m.groups ?? {};
    add(spec, m.groups?.type !== undefined || INLINE_TYPE_ONLY.test(body.trim()));
  }
  for (const m of source.matchAll(SIDE_EFFECT)) {
    add(m.groups?.spec ?? '', false);
  }
  for (const m of source.matchAll(DYNAMIC)) {
    add(m.groups?.spec ?? '', false);
  }
  return uses;
}

function violations(source: string, file: string): string[] {
  return guardedImports(source, file).flatMap((u) => {
    const ok = u.typeOnly ? ALLOWED_TYPE.has(u.target) : ALLOWED_VALUE.has(u.target);
    return ok ? [] : [`${file}: ${u.typeOnly ? 'type' : 'value'} import of ${u.target}`];
  });
}

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

describe('layering scanner', () => {
  const file = 'src/bots/x.ts';
  it.each([
    ["import type { Command } from '../sim/commands.ts';", 0],
    ["import type { SimEvent } from '../sim/events.ts';", 0],
    ["import { type Command } from '../sim/commands.ts';", 0],
    ["import { ticks } from '../sim/time.ts';", 0],
    ["import { Sim } from '../sim/sim.ts';", 1],
    ["import type { Sim } from '../sim/sim.ts';", 1],
    ["import { applyCommand } from '../sim/commands.ts';", 1],
    ["import { findById } from '../content/types.ts';", 0],
    ["import type { Perception } from '../perception/types.ts';", 0],
    ["import { x } from '../perception/types.ts';", 1],
    ["import type { PerceptionMemory } from '../perception/memory.ts';", 1],
    ["import { perceive } from '../perception/perceive.ts';", 1],
    ["import type { Match } from '../match/match.ts';", 1],
    ["import { Match } from '../match/match.ts';", 1],
    ["import type { IntentBoard } from '../intents/board.ts';", 1],
    ["import { applyIntentCommand } from '../intents/board.ts';", 1],
    ["export { x } from '../sim/entities.ts';", 1],
    ["import '../sim/sim.ts';", 1],
    ["const m = await import('../sim/sim.ts');", 1],
    ["import type {\n  A,\n  B,\n} from '../sim/hash.ts';", 1],
  ] as const)('%s -> %i violations', (src, n) => {
    expect(violations(src, file)).toHaveLength(n);
  });
});

describe('layering', () => {
  it.each(DIRS)('src/%s has sources', (dir) => {
    expect(sources(join('src', dir)).length).toBeGreaterThan(0);
  });

  it.each(DIRS)('src/%s imports only the allowed shapes (sim commands/events/time, perception types)', (dir) => {
    const bad = sources(join('src', dir)).flatMap((f) => violations(readFileSync(f, 'utf8'), f.split('\\').join('/')));
    expect(bad).toEqual([]);
  });
});
