import { expect, test as it } from 'vitest';
import {
  heroColor,
  type IntentState,
  intentColor,
  intentState,
  statusLetters,
  teamColor,
} from '../../src/client/colors.ts';
import type { LogLine } from '../../src/client/eventlog.ts';
import { pushEvents, visibleLines } from '../../src/client/eventlog.ts';
import { fitWorld, toScreen } from '../../src/client/view.ts';
import type { SimEvent } from '../../src/sim/events.ts';

it('fitWorld centres and keeps aspect', () => {
  const fit = fitWorld({ w: 100, h: 50 }, { w: 400, h: 400 }, 0);
  expect(fit.scale).toBe(4);
  expect(toScreen(fit, 0, 0)).toEqual({ x: 0, y: 100 });
  expect(toScreen(fit, 100, 50)).toEqual({ x: 400, y: 300 });
});

it('fitWorld respects margin and tiny canvases', () => {
  const fit = fitWorld({ w: 100, h: 50 }, { w: 224, h: 1000 }, 12);
  expect(fit.scale).toBe(2);
  expect(fitWorld({ w: 100, h: 50 }, { w: 0, h: 0 }, 12).scale).toBeGreaterThan(0);
});

it('colours are stable and distinct per hero', () => {
  expect(heroColor('gunner')).not.toBe(heroColor('tank'));
  expect(heroColor('mystery')).toBe(heroColor('mystery'));
  expect(teamColor(1, 'grunt')).toContain('hsl(');
});

it('statusLetters lists only active, distinct statuses', () => {
  const s = (status: string, until: number, src = 1) => ({ status, until, src, value: 0 });
  expect(
    statusLetters([s('marked', 10), s('rooted', 5), s('taunted', 10, 1), s('taunted', 10, 2), s('zzz', 10)], 7),
  ).toBe('MT?');
  expect(statusLetters([], 0)).toBe('');
});

it('pushEvents names entities, filters kinds and keeps the last lines', () => {
  const log: LogLine[] = [];
  const book = new Map<number, string>();
  pushEvents(
    log,
    book,
    [
      { tick: 0, kind: 'spawn', id: 2, def: 'grunt', team: 1 },
      { tick: 3, kind: 'hash', stateHash: 'x' },
      { tick: 4, kind: 'death', id: 2, killer: 0 },
      { tick: 5, kind: 'wave', n: 1, phase: 'start', composition: [] },
    ],
    20,
  );
  expect(log.map((l) => l.text)).toEqual(['t4 grunt#2 died (killer none)', 't5 wave 1 start']);
  pushEvents(log, book, [{ tick: 6, kind: 'end', wave: 1, reason: 'victory' }], 2);
  expect(log.map((l) => l.text)).toEqual(['t5 wave 1 start', 't6 game over: victory (wave 1)']);
});

it('pushEvents categorises cmd, choice and intent lines and visibleLines filters them', () => {
  const log: LogLine[] = [];
  pushEvents(
    log,
    new Map(),
    [
      { tick: 1, kind: 'cmd', player: 0, cmd: { kind: 'move', hero: 2, x: 1, y: 2 } },
      { tick: 2, kind: 'choice', hero: 2, decision: 'gunner.stance', options: [{ id: 'a', score: 1 }], picked: 'a' },
      { tick: 3, kind: 'intent', id: 1, op: 'post', by: 2, intentKind: 'pull' },
      { tick: 4, kind: 'wave', n: 1, phase: 'start', composition: [] },
    ],
    10,
  );
  expect(log.map((l) => l.cat)).toEqual(['cmd', 'choice', 'intent', 'other']);
  const none = { cmd: false, choice: false, intent: false };
  expect(visibleLines(log, none, 10).map((l) => l.cat)).toEqual(['other']);
  expect(visibleLines(log, { ...none, cmd: true }, 10).map((l) => l.cat)).toEqual(['cmd', 'other']);
  expect(visibleLines(log, { cmd: true, choice: true, intent: true }, 2).map((l) => l.cat)).toEqual([
    'intent',
    'other',
  ]);
});

it('intent state follows fired, then expiry, then reservers; colours differ', () => {
  expect(intentState({ fired: false, fireTick: 50, reservers: [] }, 10)).toBe('posted');
  expect(intentState({ fired: false, fireTick: 50, reservers: [3] }, 10)).toBe('reserved');
  expect(intentState({ fired: true, fireTick: 50, reservers: [3] }, 60)).toBe('fired');
  expect(intentState({ fired: false, fireTick: 50, reservers: [3] }, 50)).toBe('expired');
  expect(
    new Set((['posted', 'reserved', 'fired', 'expired'] as const satisfies readonly IntentState[]).map(intentColor))
      .size,
  ).toBe(4);
});

it('pushEvents trims per category, so filtered-off chatter cannot evict other lines', () => {
  const log: LogLine[] = [];
  const cmd = (tick: number): SimEvent => ({
    tick,
    kind: 'cmd',
    player: 0,
    cmd: { kind: 'move', hero: 2, x: 1, y: 2 },
  });
  pushEvents(log, new Map(), [{ tick: 0, kind: 'intent', id: 1, op: 'post', by: 2, intentKind: 'pull' }], 3);
  pushEvents(log, new Map(), [1, 2, 3, 4, 5, 6, 7].map(cmd), 3);
  expect(log.filter((l) => l.cat === 'cmd')).toHaveLength(3);
  expect(log.filter((l) => l.cat === 'intent')).toHaveLength(1);
});
