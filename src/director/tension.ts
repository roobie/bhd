// Tension accumulator (wave w2-bots DESIGN "Wave master in the sim, Director outside"). STUB (basic
// and working): the director slice owns it. Contract: `updateTension` is a pure step of the state
// from perception; value stays in 0..1; phase changes build -> peak (value above `peakAbove`) ->
// relax (value at/below `relaxBelow`) -> build (value at/below `relaxBelow` while relaxed and
// nothing is pending is the slice's call).

import type { DirectorDef } from '../content/director.ts';
import type { Perception } from '../perception/types.ts';

export type TensionPhase = 'build' | 'peak' | 'relax';

export interface TensionState {
  value: number;
  phase: TensionPhase;
}

export function createTension(): TensionState {
  return { value: 0, phase: 'build' };
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Advances `state` by `seconds` using the drivers in `p` (team damage, low heroes, leaks). */
export function updateTension(state: TensionState, p: Perception, def: DirectorDef, seconds: number): void {
  const t = def.tension;
  const raw = p.team.damageFrac * t.damageGain + p.team.lowHeroes * t.lowHpGain + p.team.leaks * t.leakGain;
  state.value = clamp01(Math.max(raw, state.value - t.decayPerSecond * seconds));
  if (state.phase === 'build' && state.value > t.peakAbove) {
    state.phase = 'peak';
  } else if (state.phase === 'peak' && state.value <= t.relaxBelow) {
    state.phase = 'relax';
  } else if (state.phase === 'relax' && state.value <= t.relaxBelow && p.wave.n < p.wave.total) {
    state.phase = 'build';
  }
}
