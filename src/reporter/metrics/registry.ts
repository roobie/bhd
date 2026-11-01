// The metric registry (step 2b): every MetricDef, and the per-game evaluation of all of them.

import type { GameLog, MetricDef, MetricValues } from '../types.ts';
import { seriesName } from '../types.ts';

/** Registered metrics, in report order. Step 2b fills it (docs/METRICS.md). */
export const METRICS: readonly MetricDef[] = [];

/** Every series value of one game, keyed by `seriesName(metric.id, key)`. */
export function computeMetrics(log: GameLog, metrics: readonly MetricDef[] = METRICS): MetricValues {
  const out: Record<string, number> = {};
  for (const m of metrics) {
    for (const [key, value] of Object.entries(m.compute(log))) {
      out[seriesName(m.id, key)] = value;
    }
  }
  return out;
}
