import { expect, test as it } from 'vitest';
import { heroColor, intentColor, intentState, statusLetters, teamColor } from '../../src/client/colors.ts';
import type { LogLine } from '../../src/client/eventlog.ts';
import { pushEvents, visibleLines } from '../../src/client/eventlog.ts';
import { fitWorld, toScreen } from '../../src/client/view.ts';

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

it('intent state follows fired then reservers; colours differ', () => {
  expect(intentState({ fired: false, reservers: [] })).toBe('posted');
  expect(intentState({ fired: false, reservers: [3] })).toBe('reserved');
  expect(intentState({ fired: true, reservers: [3] })).toBe('fired');
  expect(new Set([intentColor('posted'), intentColor('reserved'), intentColor('fired')]).size).toBe(3);
});
