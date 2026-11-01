// Penitent brain. Owner: slice A (w8). STEP 1 STUB: decides nothing, so the Penitent seat idles.
// Decision ids will be `penitent.<decision>`; weights live in content/bots/penitent.ts.

import type { Brain } from './types.ts';

export const penitentBrain: Brain<null> = {
  init: () => null,
  think: () => [],
};
