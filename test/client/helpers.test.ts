import { expect, test as it } from 'vitest';
import { heroColor, statusLetters, teamColor } from '../../src/client/colors.ts';
import { pushEvents } from '../../src/client/eventlog.ts';
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
  const log: string[] = [];
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
  expect(log).toEqual(['t4 grunt#2 died (killer none)', 't5 wave 1 start']);
  pushEvents(log, book, [{ tick: 6, kind: 'end', wave: 1, reason: 'victory' }], 2);
  expect(log).toEqual(['t5 wave 1 start', 't6 game over: victory (wave 1)']);
});
