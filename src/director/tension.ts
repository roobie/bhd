// Tension accumulator (wave w2-bots DESIGN "Wave master in the sim, Director outside"). Owner:
// director. Pure step of the state from perception; `value` stays in 0..1.
//
// value' = clamp01(max(level, value - decay * seconds) + lowHeroes * lowHpGain * seconds), where
// `level` is the windowed team damage and leaks (perception already windows them) and `lowHeroes`
// counts heroes at or below the Director's own `lowHpFrac`.
// Phases: build -> peak (value above `peakAbove`) -> relax (value at/below `relaxBelow`) -> build
// (after `relaxSeconds` in relax). A relaxed Director whose tension spikes again goes back to peak.

import type { DirectorDef } from '../content/director.ts';
import type { Perception } from '../perception/types.ts';

export type TensionPhase = 'build' | 'peak' | 'relax';

export interface TensionState {
  value: number;
  phase: TensionPhase;
  /** Seconds spent in the current phase. */
  phaseSeconds: number;
}

export function createTension(): TensionState {
  return { value: 0, phase: 'build', phaseSeconds: 0 };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function enter(state: TensionState, phase: TensionPhase): void {
  state.phase = phase;
  state.phaseSeconds = 0;
}

/** Advances `state` by `seconds` using the drivers in `p` (team damage, low heroes, leaks). */
export function updateTension(state: TensionState, p: Perception, def: DirectorDef, seconds: number): void {
  const t = def.tension;
  const low = p.heroes.filter((h) => h.hpFrac <= t.lowHpFrac).length;
  const level = p.team.damageFrac * t.damageGain + p.team.leaks * t.leakGain;
  state.value = clamp01(Math.max(level, state.value - t.decayPerSecond * seconds) + low * t.lowHpGain * seconds);
  state.phaseSeconds += seconds;
  if (state.phase !== 'peak' && state.value > t.peakAbove) {
    enter(state, 'peak');
  } else if (state.phase === 'peak' && state.value <= t.relaxBelow) {
    enter(state, 'relax');
  } else if (state.phase === 'relax' && state.phaseSeconds >= t.relaxSeconds) {
    enter(state, 'build');
  }
}
