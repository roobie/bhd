// `bhd desync`: reads two input-log dumps from disk and prints the first divergent tick.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDesync } from '../../src/reporter/desynccmd.ts';
import { Session } from '../net/harness.ts';

describe('bhd desync', () => {
  it('reads two dumps and prints the first divergent tick; wrong usage is exit 2', () => {
    const s = new Session({ peers: 2, seed: 23, latency: { min: 10, max: 100 } });
    const [, bad] = s.peers;
    s.runUntil(75);
    const hero = bad?.match.perception.heroes.find((h) => h.slot === 1)?.id ?? 0;
    // Past the driver, on one peer only: a rule R1 violation.
    bad?.match.sim.command(1, { kind: 'move', hero, x: 1234, y: 4321 });
    const stray = (bad?.match.tick ?? 0) + 1;
    s.runUntil(stray + 100);
    s.drain();
    const dir = mkdtempSync(join(tmpdir(), 'bhd-desync-'));
    try {
      writeFileSync(join(dir, 'a.ndjson'), s.host.driver.dump() ?? '');
      writeFileSync(join(dir, 'b.ndjson'), bad?.driver.dump() ?? '');
      const lines: string[] = [];
      expect(runDesync([join(dir, 'a.ndjson'), join(dir, 'b.ndjson')], (t) => lines.push(t))).toBe(0);
      expect(lines.join('\n')).toContain(`first divergent tick: ${stray}`);
      expect(runDesync([join(dir, 'a.ndjson')], () => undefined)).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
