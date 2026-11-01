// The pre-w8 lineup (Gunner, tank, ranged, support stand-ins) for the tests that exercise the
// stand-in kit or need a generic team of known ids: 2 Gunner, 3 tank, 4 ranged, 5 support. The
// shipping lineup (Gunner, Penitent, Psyker, support) is `defaultGame()`.

import { gunnerDef } from '../src/content/heroes/gunner.ts';
import { standinDefs } from '../src/content/heroes/standins.ts';
import type { GameConfig } from '../src/content/index.ts';
import { defaultGame } from '../src/content/index.ts';

export function legacyGame(): GameConfig {
  return { ...defaultGame(), heroes: [gunnerDef(), ...standinDefs()] };
}

/** Every hero kit the game ships, for the help and presentation coverage tests (6 heroes: not for playing). */
export function rosterGame(): GameConfig {
  const base = defaultGame();
  return { ...base, heroes: [...base.heroes.slice(0, 3), ...standinDefs()] };
}
