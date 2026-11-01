// HUD fragments for the debug viewer. Read-only over the sim.

import { html } from 'lit-html';
import { STANCE } from '../sim/heroes/gunner.ts';
import type { Sim } from '../sim/sim.ts';

const STANCE_NAMES = ['free', 'braced', 'unbracing'];

export function countsText(sim: Sim): string {
  let heroes = 0;
  let enemies = 0;
  for (const e of sim.entities.values()) {
    if (e.kind === 'hero') {
      heroes += 1;
    } else if (e.kind === 'enemy') {
      enemies += 1;
    }
  }
  return `heroes ${heroes}, enemies ${enemies}, total ${sim.entities.size}`;
}

export function ancientText(sim: Sim): string {
  for (const e of sim.entities.values()) {
    if (e.kind === 'ancient') {
      return `${Math.max(0, Math.round(e.hp))}/${e.maxHp}`;
    }
  }
  return 'gone';
}

/** Heat marks: the pierce threshold comes from the gunner def; 85 (overpen) and 100 (overheat) too. */
export function gunnerHud(sim: Sim) {
  for (const e of sim.entities.values()) {
    const { kit } = e;
    if (e.kind !== 'hero' || kit?.kind !== 'gunner') {
      continue;
    }
    const pct = Math.round(kit.heat / 100); // heat is basis points (0..10000)
    const def = sim.game.heroes.find((h) => h.kit === 'gunner');
    const pierce = Math.round((def?.kit === 'gunner' ? def.heat.pierceAbove : 0.6) * 100);
    const flags = [kit.lockTicks > 0 ? 'overheated' : '', kit.furnaceTicks > 0 ? 'furnace' : ''].filter(Boolean);
    return html`<div class="gunner">
      <div>gunner heat ${pct}%${flags.length > 0 ? ` (${flags.join(', ')})` : ''}</div>
      <div class="heat" role="meter" aria-label="gunner heat" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${pct}>
        <div class="fill" style="width:${pct}%"></div>
        <i style="left:${pierce}%"></i><i style="left:85%"></i><i style="left:100%"></i>
      </div>
      <div>braced: ${kit.stance === STANCE.braced ? 'yes' : 'no'} (${STANCE_NAMES[kit.stance] ?? kit.stance})</div>
    </div>`;
  }
  return html``;
}
