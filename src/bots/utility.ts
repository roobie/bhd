// Utility scoring (wave w2-bots DESIGN "Utility framework"). Owner: contracts.
// score = value - cost + (stickiness if it was the previous pick) + (noise * nextFloat(rng) when
// noise > 0). Options are scored in their fixed order; the noise draws happen in that order and
// only when noise > 0. Ties go to the first option. Scores are always finite and never -0
// (L-BUDC4M5PFNLU2NTN): a NaN or infinite score counts as the worst, so a bad weight cannot win.

import { nextFloat, type Rng } from '../detmath/index.ts';
import type { Decision, Option } from './types.ts';

/** The parts of a doctrine that scoring needs. */
export interface Tune {
  readonly stickiness: number;
  readonly noise: number;
}

export interface Pick {
  readonly option: Option;
  /** Index of `option` in the decision. */
  readonly index: number;
  /** One score per option, in order. */
  readonly scores: readonly number[];
}

const WORST = -1e9;

function clean(score: number): number {
  // `+ 0` turns -0 into 0.
  return Number.isFinite(score) ? score + 0 : WORST;
}

/** Picks the best option. `prev` is the option id picked last time for this decision, if any. */
export function decide(decision: Decision, tune: Tune, rng: Rng, prev: string | undefined): Pick {
  const [first] = decision.options;
  if (first === undefined) {
    throw new RangeError(`decision '${decision.id}' has no options`);
  }
  const scores: number[] = [];
  let best = 0;
  decision.options.forEach((o, i) => {
    let s = o.value - o.cost;
    if (o.id === prev) {
      s += tune.stickiness;
    }
    if (tune.noise > 0) {
      s += tune.noise * nextFloat(rng);
    }
    scores.push(clean(s));
    if ((scores[i] ?? WORST) > (scores[best] ?? WORST)) {
      best = i;
    }
  });
  return { option: decision.options[best] ?? first, index: best, scores };
}

/** A tunable number by key, `fallback` when the key is absent. */
export function weight(weights: Readonly<Record<string, number>>, key: string, fallback: number): number {
  return weights[key] ?? fallback;
}
