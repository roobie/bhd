// Game rules knobs (not tied to one unit): hero respawn and what a team wipe does. Content values,
// not code, so B can tune them and the reporter can compare configs. Seconds.

/** Respawn timer: `min(max, base + perWave * wave)` seconds after a hero goes down (wave = waves started). */
interface RespawnRule {
  readonly base: number;
  readonly perWave: number;
  readonly max: number;
}

export interface RulesDef {
  /** World units: a lane enemy gives up a (non-taunted) target farther than this from the lane (was 10). */
  readonly leashRange: number;
  readonly respawn: RespawnRule;
  /** True: the game ends ('team-wiped') when no hero is up. False (default, D-IYLBKMAIQNR7GE3R): only the Ancient's death ends it. */
  readonly wipeLoses: boolean;
  /** Seconds after a wave starts before `callWave` may start the next one (the wave must also be done spawning). */
  readonly callWaveMinSeconds: number;
}

export function defaultRules(): RulesDef {
  return { leashRange: 13, respawn: { base: 10, perWave: 2, max: 45 }, wipeLoses: false, callWaveMinSeconds: 5 };
}
