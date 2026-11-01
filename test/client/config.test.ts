import { expect, test as it } from 'vitest';
import {
  defaultConfig,
  parseHash,
  parseMode,
  parseSeconds,
  parseSeed,
  REACTION_RANGE,
  serialiseHash,
} from '../../src/client/config.ts';
import { buildMatch } from '../../src/client/setup.ts';

it('parseHash(serialiseHash(c)) round-trips', () => {
  const c = {
    ...defaultConfig(),
    seed: 4_294_967_295,
    mode: 'schedule' as const,
    reactionSeconds: 1.5,
    thinkSeconds: 0.2,
  };
  expect(parseHash(serialiseHash(c))).toEqual(c);
  expect(parseHash(serialiseHash(defaultConfig()))).toEqual(defaultConfig());
});

it('bad or missing hash fields fall back to defaults', () => {
  expect(parseHash('')).toEqual(defaultConfig());
  expect(parseHash('#seed=-1&mode=x&doc=a,b&react=9&think=nan')).toEqual(defaultConfig());
  expect(parseHash('#seed=7&mode=bogus').seed).toBe(7);
});

it('inputs are validated', () => {
  expect(parseSeed('42')).toBe(42);
  for (const bad of ['', '-1', '1.5', '4294967296', 'abc', '1e3', '99999999999']) {
    expect(parseSeed(bad)).toBeUndefined();
  }
  expect(parseSeconds('0.4', REACTION_RANGE)).toBe(0.4);
  for (const bad of ['', '0', '3.1', '-1', 'NaN', 'Infinity', '1e1']) {
    expect(parseSeconds(bad, REACTION_RANGE)).toBeUndefined();
  }
  expect(parseMode('director')).toBe('director');
  expect(parseMode('x')).toBeUndefined();
});

it('every mode builds a Match that steps', () => {
  for (const mode of ['director', 'schedule'] as const) {
    const m = buildMatch({ ...defaultConfig(), mode });
    m.step();
    expect(m.seats).toHaveLength(4);
    expect(m.sim.tick).toBe(1);
    expect(m.directorStatus !== undefined).toBe(mode === 'director');
  }
});
