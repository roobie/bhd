import { describe, expect, it } from 'vitest';
import { GOLDEN } from './golden.ts';
import { runScenario, runSim, runSimInterleaved, SCRIPT, SEED, TICKS } from './scenario.ts';

describe('determinism scenario', () => {
  it('has a real golden', () => {
    expect(GOLDEN.hashes.length).toBeGreaterThan(10);
  });

  it('matches the golden result', () => {
    expect(runScenario()).toEqual(GOLDEN);
  });

  it('interleaved submission matches the up-front run', () => {
    expect(runSimInterleaved(SEED, SCRIPT, TICKS)).toEqual(runSim(SEED, SCRIPT, TICKS));
  });
});
