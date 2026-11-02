// Desync detection: a command that bypasses the driver (a rule R1 violation) on one peer is caught at
// the next hash checkpoint, everyone halts, and the dumps localise it. Plus the input-log codec.

import { describe, expect, it } from 'vitest';
import { analyzeDesync, formatDesyncReport } from '../../src/net/desync.ts';
import { decodeInputLog, encodeInputLog } from '../../src/net/inputlog.ts';
import { type PeerRig, Session } from './harness.ts';

const CHECK = 30;

function faulty(peers: number, seed: number): { s: Session; stray: number; bad: PeerRig } {
  const s = new Session({ peers, seed, latency: { min: 10, max: 100 } });
  const bad = s.peers[1] as PeerRig;
  s.runUntil(70);
  while (bad.match.tick < 75) {
    s.frame();
  }
  const hero = bad.match.perception.heroes.find((h) => h.slot === 1)?.id ?? 0;
  // Straight into the sim, past the driver: the hero walks somewhere nobody else sent it.
  if (!bad.match.sim.command(1, { kind: 'move', hero, x: 1234, y: 4321 }).ok) {
    throw new Error('stray command refused');
  }
  const stray = bad.match.tick + 1;
  s.runUntil(stray + 3 * CHECK);
  return { s, stray, bad };
}

describe('desync detection', () => {
  it.each([2, 3])('%i peers: a stray sim.command is detected at the next checkpoint and halts everyone', (peers) => {
    const { s, stray } = faulty(peers, 21);
    for (let i = 0; i < 60; i++) {
      s.frame();
    }
    const checkpoint = Math.ceil(stray / CHECK) * CHECK;
    for (const p of s.peers) {
      expect(p.driver.status()).toBe('desynced');
      expect(p.driver.desyncTick()).toBe(checkpoint);
    }
    const frozen = s.peers.map((p) => p.match.tick);
    for (let i = 0; i < 30; i++) {
      s.frame();
    }
    expect(s.peers.map((p) => p.match.tick)).toEqual(frozen);
  });

  it('the dumps pinpoint the stray command and the checkpoint it broke', () => {
    const { s, stray, bad } = faulty(2, 22);
    for (let i = 0; i < 60; i++) {
      s.frame();
    }
    const host = decodeInputLog(s.host.driver.dump() ?? '');
    const peer = decodeInputLog(bad.driver.dump() ?? '');
    if (!(host.ok && peer.ok)) {
      throw new Error('dump does not decode');
    }
    const report = analyzeDesync(host.log, peer.log);
    expect(report.a.badCmd).toBeUndefined();
    expect(report.a.badCheckpoint).toBeUndefined();
    expect(report.b.badCmd?.tick).toBe(stray);
    expect(report.b.badCmd?.recorded?.cmd).toMatchObject({ kind: 'move', x: 1234, y: 4321 });
    expect(report.b.badCmd?.replayed?.cmd).not.toMatchObject({ x: 1234 });
    expect(report.b.badCheckpoint?.tick).toBe(Math.ceil(stray / CHECK) * CHECK);
    expect(report.firstTick).toBe(stray);
    expect(formatDesyncReport(report)).toContain(`first divergent tick: ${stray}`);
  });

  it('two healthy dumps show no divergence', () => {
    const s = new Session({ peers: 2, seed: 24, latency: { min: 10, max: 90 } });
    s.runUntil(100);
    s.drain();
    const a = decodeInputLog(s.host.driver.dump() ?? '');
    const b = decodeInputLog(s.peers[1]?.driver.dump() ?? '');
    if (!(a.ok && b.ok)) {
      throw new Error('dump does not decode');
    }
    expect(analyzeDesync(a.log, b.log).firstTick).toBeUndefined();
  });
});

describe('input log codec', () => {
  it('round-trips a log and refuses garbage without throwing', () => {
    const s = new Session({ peers: 2, seed: 25, latency: { min: 10, max: 60 } });
    s.runUntil(90);
    s.drain();
    const log = s.peers[1]?.driver.log();
    expect(log?.seals.length).toBeGreaterThan(50);
    const text = encodeInputLog(log as NonNullable<typeof log>);
    const back = decodeInputLog(text);
    expect(back.ok).toBe(true);
    expect(back.ok && encodeInputLog(back.log)).toBe(text);
    for (const bad of ['', 'nope', '{}\n', `${text.split('\n')[0]}\n{"k":"seal","tick":1,"inputs":"x"}\n`]) {
      expect(decodeInputLog(bad).ok).toBe(false);
    }
  });
});
