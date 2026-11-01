// The metric registry (step 2b): every MetricDef, and the per-game evaluation of all of them.
// docs/METRICS.md describes each one.

import type { GameLog, MetricDef, MetricValues } from '../types.ts';
import { seriesName } from '../types.ts';
import { choiceSpread } from './choice.ts';
import { gunnerHeatBand, gunnerPavise } from './gunner.ts';
import {
  abilityCasts,
  abilityValue,
  heroDeaths,
  heroDmgShare,
  heroDowntime,
  heroRespawns,
  teamFf,
  ultTiming,
} from './hero.ts';
import { comboPayoffs, comboRate, intentFulfil, intentLatency } from './intents.ts';
import { outcomeAncientHp, outcomeLeaks, outcomeWave, teamLowestHp } from './outcome.ts';
import { penitentNova, penitentPain } from './penitent.ts';
import { psykerBacklash, psykerWarpHigh } from './psyker.ts';

/** Registered metrics, in report order (docs/METRICS.md; ability and intent each have two defs). */
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
  comboPayoffs,
  intentFulfil,
  intentLatency,
  choiceSpread,
  teamLowestHp,
  ultTiming,
  heroDowntime,
  heroRespawns,
  gunnerPavise,
  penitentPain,
  penitentNova,
  psykerWarpHigh,
  psykerBacklash,
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
