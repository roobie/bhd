import { describe, expect, it } from 'vitest';
import { defaultShellConfig, parseShellHash, serialiseShellHash, shellSpec } from '../../../src/client/shell/config.ts';
import type { ShellConfig } from '../../../src/client/shell/types.ts';
import { buildMatch } from '../../../src/match/run.ts';

describe('shell hash', () => {
  it('round-trips', () => {
    const configs: ShellConfig[] = [
      defaultShellConfig(),
      { seed: 4_294_967_295, mode: 'schedule', drive: [] },
      { seed: 7, mode: 'director', drive: [0, 3] },
      { seed: 0, mode: 'director', drive: [1, 2, 3] },
    ];
    for (const c of configs) {
      expect(parseShellHash(serialiseShellHash(c))).toEqual(c);
      expect(parseShellHash(`#${serialiseShellHash(c)}`)).toEqual(c);
    }
  });

  it('reads the documented form', () => {
    expect(parseShellHash('#seed=5&mode=schedule&drive=3,0,3')).toEqual({ seed: 5, mode: 'schedule', drive: [0, 3] });
    expect(parseShellHash('seed=1&drive=')).toEqual({ seed: 1, mode: 'director', drive: [] });
    expect(parseShellHash('')).toEqual(defaultShellConfig());
  });

  it('falls back to defaults on bad input and never throws', () => {
    const bad = [
      '#seed=-1',
      '#seed=abc&mode=nope&drive=9',
      '#drive=0,x',
      '#drive=4',
      '#seed=99999999999',
      '%%%',
      '#&&=&',
    ];
    for (const h of bad) {
      expect(parseShellHash(h)).toEqual(defaultShellConfig());
    }
    expect(parseShellHash('#seed=3&drive=7').seed).toBe(3);
  });

  it('shellSpec builds a match with the driven seats left out', () => {
    const spec = shellSpec({ seed: 2, mode: 'director', drive: [0, 3] });
    expect(spec.humans).toEqual([0, 3]);
    expect(buildMatch(spec).seats.map((s) => s.slot)).toEqual([1, 2]);
    expect(buildMatch(shellSpec(defaultShellConfig())).seats).toHaveLength(3);
  });
});
