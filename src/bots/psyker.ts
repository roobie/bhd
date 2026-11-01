// Psyker brain. Owner: slice B (w8). STEP 1 STUB: decides nothing, so the Psyker seat idles.
// Decision ids will be `psyker.<decision>`; weights live in content/bots/psyker.ts.

import type { Brain } from './types.ts';

export const psykerBrain: Brain<null> = {
  init: () => null,
  think: () => [],
};
