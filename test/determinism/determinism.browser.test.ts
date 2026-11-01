import { describe, expect, inject, it } from 'vitest';
import { runScenario, runSim, runSimInterleaved, SCRIPT, SEED, TICKS } from './scenario.ts';

describe('determinism scenario', () => {
  const reference = inject('nodeScenario');

  it('has a real reference from Node', () => {
    expect(reference.hashes.length).toBeGreaterThan(10);
    expect(reference.match.hashes.length).toBeGreaterThan(10);
    expect(reference.master.hashes.length).toBeGreaterThan(10);
    expect(reference.detmath.length).toBeGreaterThan(0);
    expect(reference.detmathSweep.length).toBeGreaterThan(0);
  });

  it('matches the Node run exactly (cross-runtime equality)', () => {
    expect(runScenario()).toEqual(reference);
  });

  it('interleaved submission matches the up-front run', () => {
    expect(runSimInterleaved(SEED, SCRIPT, TICKS)).toEqual(runSim(SEED, SCRIPT, TICKS));
  });
});
