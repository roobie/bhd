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

export function gunnerHud(sim: Sim) {
  for (const e of sim.entities.values()) {
    const { kit } = e;
    if (e.kind !== 'hero' || kit?.kind !== 'gunner') {
      continue;
    }
    const pct = Math.round(kit.heat * 100);
    const flags = [kit.lockTicks > 0 ? 'overheated' : '', kit.furnaceTicks > 0 ? 'furnace' : ''].filter(Boolean);
    return html`<div class="gunner">
      <div>gunner heat ${pct}%${flags.length > 0 ? ` (${flags.join(', ')})` : ''}</div>
      <div class="heat" role="meter" aria-label="gunner heat" aria-valuemin="0" aria-valuemax="100" aria-valuenow=${pct}>
        <div class="fill" style="width:${pct}%"></div>
        <i style="left:60%"></i><i style="left:85%"></i><i style="left:100%"></i>
      </div>
      <div>braced: ${kit.stance === STANCE.braced ? 'yes' : 'no'} (${STANCE_NAMES[kit.stance] ?? kit.stance})</div>
    </div>`;
  }
  return html``;
}
