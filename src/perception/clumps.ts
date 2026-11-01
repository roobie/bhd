// Enemy clumps (DESIGN "Perception"). STUB (basic and working): the perception slice owns it.
// Contract: sweep enemies by descending lane progress then ascending id; each joins the FIRST clump
// whose centroid is within `radius` (centroid updated to the mean of its members), else starts a new
// clump. Every enemy lands in exactly one clump.

import type { Clump, EnemyView } from './types.ts';

interface Building {
  members: number[];
  sumX: number;
  sumY: number;
  front: number;
}

function centroid(c: Building): { x: number; y: number } {
  return { x: c.sumX / c.members.length, y: c.sumY / c.members.length };
}

export function buildClumps(enemies: readonly EnemyView[], radius: number): Clump[] {
  const sweep = [...enemies].sort((a, b) => b.progress - a.progress || a.id - b.id);
  const building: Building[] = [];
  for (const e of sweep) {
    let home = building.find((c) => {
      const m = centroid(c);
      const dx = m.x - e.x;
      const dy = m.y - e.y;
      return dx * dx + dy * dy <= radius * radius;
    });
    if (home === undefined) {
      home = { members: [], sumX: 0, sumY: 0, front: e.progress };
      building.push(home);
    }
    home.members.push(e.id);
    home.sumX += e.x;
    home.sumY += e.y;
  }
  return building.map((c, id) => {
    const m = centroid(c);
    return { id, members: c.members, x: m.x, y: m.y, count: c.members.length, front: c.front };
  });
}
