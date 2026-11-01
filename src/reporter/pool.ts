// Worker-thread pool: runs a batch of games on both sides (step 2a).

import type { BatchPlan, BatchResult } from './types.ts';

/**
 * Runs every (lineup, seed) game of `plan.scenario` on both sides, reusing logs already on disk,
 * and returns the records sorted by (side, lineup, seed). `onProgress(done, total)` is called as
 * games finish.
 */
export function runBatch(_plan: BatchPlan, _onProgress?: (done: number, total: number) => void): Promise<BatchResult> {
  return Promise.reject(new Error('runBatch: not implemented'));
}
