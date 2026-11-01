// The metric registry (step 2b): every MetricDef, and the per-game evaluation of all of them.
// docs/METRICS.md describes each one.

import type { GameLog, MetricDef, MetricValues } from '../types.ts';
import { seriesName } from '../types.ts';
import { choiceSpread } from './choice.ts';
import { gunnerHeatBand } from './gunner.ts';
import { abilityCasts, abilityValue, heroDeaths, heroDmgShare, teamFf, ultTiming } from './hero.ts';
import { comboRate, intentFulfil, intentLatency } from './intents.ts';
import { outcomeAncientHp, outcomeLeaks, outcomeWave, teamLowestHp } from './outcome.ts';

/** Registered metrics, in report order (the 13 of docs/METRICS.md; ability and intent each have two defs). */
export const METRICS: readonly MetricDef[] = [
  outcomeWave,
  outcomeLeaks,
  outcomeAncientHp,
  heroDeaths,
  heroDmgShare,
  teamFf,
  gunnerHeatBand,
  abilityCasts,
  abilityValue,
  comboRate,
  intentFulfil,
  intentLatency,
  choiceSpread,
  teamLowestHp,
  ultTiming,
];

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
