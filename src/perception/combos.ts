// Combo windows (DESIGN "Perception"). A window is a status zone worth a payoff now: within one
// clump, at least `minCount` enemies carry the same status. One window per (clump, status), ordered
// by clump id then by the order of `statuses`. The zone is the centroid of the carriers and the
// radius that covers them; `until` is the latest tick a carrier loses the status.

import type { Clump, ComboWindow, EnemyView } from './types.ts';

interface ComboRules {
  readonly statuses: readonly string[];
  readonly minCount: number;
}

interface Carrier {
  readonly e: EnemyView;
  readonly until: number;
}

function windowOf(status: string, carriers: readonly Carrier[]): ComboWindow {
  const n = carriers.length;
  const x = carriers.reduce((s, k) => s + k.e.x, 0) / n;
  const y = carriers.reduce((s, k) => s + k.e.y, 0) / n;
  let radius = 0;
  let until = 0;
  for (const k of carriers) {
    radius = Math.max(radius, Math.sqrt((k.e.x - x) * (k.e.x - x) + (k.e.y - y) * (k.e.y - y)));
    until = Math.max(until, k.until);
  }
  return { status, x, y, radius, count: n, until };
}

export function findComboWindows(
  enemies: readonly EnemyView[],
  clumps: readonly Clump[],
  rules: ComboRules,
): ComboWindow[] {
  const byId = new Map(enemies.map((e) => [e.id, e] as const));
  const out: ComboWindow[] = [];
  for (const c of clumps) {
    for (const status of rules.statuses) {
      const carriers: Carrier[] = [];
      for (const id of c.members) {
        const e = byId.get(id);
        const st = e?.statuses.find((s) => s.status === status);
        if (e !== undefined && st !== undefined) {
          carriers.push({ e, until: st.until });
        }
      }
      if (carriers.length > 0 && carriers.length >= rules.minCount) {
        out.push(windowOf(status, carriers));
      }
    }
  }
  return out;
}
