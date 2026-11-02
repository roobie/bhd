// Lockstep core invariants over the loopback hub: every peer sees the same hashes, equal to a replay of
// the host's seals, whatever the arrival order. Nothing asserts how a game plays (D-4E4QRJ7N6LIGZDSD).

import { describe, expect, it } from 'vitest';
import { replayInputs } from '../../src/net/inputlog.ts';
import { checkpoints } from '../../src/replay/verify.ts';
import { SYSTEM_PLAYER } from '../../src/sim/commands.ts';
import { type PeerRig, Session } from './harness.ts';

const TICKS = 330;

function hashesOf(p: PeerRig): string[] {
  return p.driver.log().hashes.map((h) => `${h.tick}:${h.hash}`);
}

/**
 * What is wrong, if anything: every live peer should equal the host and the replay of the host's seals.
 * Returns problems rather than asserting, so the check can be shared (empty = agreement).
 */
function disagreements(s: Session): string[] {
  const out: string[] = [];
  const hostLog = s.host.driver.log();
  const replay = checkpoints(replayInputs(s.spec, hostLog.seals)).map((c) => `${c.tick}:${c.stateHash}`);
  const want = hashesOf(s.host);
  if (want.length <= 3) {
    out.push(`only ${want.length} host checkpoints`);
  }
  if (JSON.stringify(want) !== JSON.stringify(replay.slice(0, want.length))) {
    out.push('host hashes differ from the replay of its seals');
  }
  for (const p of s.peers) {
    out.push(...peerProblems(s, p, want));
  }
  if (s.hub.refused() > 0) {
    out.push(`${s.hub.refused()} messages refused`);
  }
  return out;
}

function peerProblems(s: Session, p: PeerRig, want: readonly string[]): string[] {
  const out: string[] = [];
  const got = hashesOf(p);
  if (p.driver.status() === 'desynced') {
    out.push(`${p.id} desynced`);
  }
  if (JSON.stringify(got) !== JSON.stringify(p.dropped ? want.slice(0, got.length) : want)) {
    out.push(`${p.id} hashes differ from the host's`);
  }
  if (!p.dropped && p.match.tick !== s.host.match.tick) {
    out.push(`${p.id} is at tick ${p.match.tick}, host at ${s.host.match.tick}`);
  }
  const { seals } = p.driver.log();
  if (JSON.stringify(seals) !== JSON.stringify(s.host.driver.log().seals.slice(0, seals.length))) {
    out.push(`${p.id} applied other seals than the host`);
  }
  return out;
}

function play(peers: number, seed: number, latency = { min: 15, max: 140 }): Session {
  const s = new Session({ peers, seed, latency });
  const last = s.peers[peers - 1] as PeerRig;
  s.runUntil(TICKS, (frame) => {
    if (frame === 40) {
      // A drive handover to a bot, with the slot's human still sending input on the same tick (L7).
      s.host.driver.submit(SYSTEM_PLAYER, { kind: 'control', op: 'drive', slot: 1, by: 'bot' });
      const p1 = s.peers[1] as PeerRig;
      p1.driver.submit(1, { kind: 'stop', hero: p1.match.perception.heroes.find((h) => h.slot === 1)?.id ?? 0 });
    }
    if (frame === 70) {
      s.host.driver.submit(SYSTEM_PLAYER, { kind: 'control', op: 'drive', slot: 1, by: 'human' });
    }
    if (frame === 100) {
      (s.peers[1] as PeerRig).driver.setPaused(true, 1);
    }
    if (frame === 125) {
      s.host.driver.setPaused(false, 0);
    }
    if (frame === 150) {
      s.host.driver.submit(SYSTEM_PLAYER, { kind: 'control', op: 'bargainPolicy', policy: 'bots' });
    }
    if (frame === 220 && peers > 3) {
      s.cut(last);
    }
  });
  s.drain();
  return s;
}

describe('lockstep over the loopback hub', () => {
  for (const peers of [2, 3, 4]) {
    for (const seed of [1, 2, 3]) {
      it(`${peers} peers, seed ${seed}: identical hash sequences, equal to the replay of the host's seals`, () => {
        const s = play(peers, seed);
        expect(disagreements(s)).toEqual([]);
        const controls = s.host.driver
          .log()
          .seals.flatMap((seal) => seal.inputs.filter((i) => i.cmd.kind === 'control'));
        expect(controls.length).toBe(peers > 3 ? 4 : 3);
        const lastHashes = (s.peers[peers - 1] as PeerRig).driver.log().hashes.length;
        expect(peers > 3 ? lastHashes < s.host.driver.log().hashes.length : true).toBe(true);
      });
    }
  }

  it('a different latency profile gives the same seals-to-hash relation (arrival order changes nothing but the seals)', () => {
    const s = play(3, 9, { min: 5, max: 300 });
    expect(disagreements(s)).toEqual([]);
  });

  it('pause halts every peer at the same tick and resume continues; the pauser is named', () => {
    const s = new Session({ peers: 3, seed: 4, latency: { min: 10, max: 120 } });
    s.runUntil(60);
    const seen: string[] = [];
    s.peers[2]?.driver.onNotice((n) => {
      if (n.kind === 'paused' || n.kind === 'resumed') {
        seen.push(`${n.kind}:${n.by}`);
      }
    });
    (s.peers[1] as PeerRig).driver.setPaused(true, 1);
    for (let i = 0; i < 40; i++) {
      s.frame();
    }
    const ticks = s.peers.map((p) => p.match.tick);
    expect(new Set(ticks).size).toBe(1);
    expect(s.peers.map((p) => p.driver.status())).toEqual(['paused', 'paused', 'paused']);
    expect(s.peers.map((p) => p.driver.pausedBy())).toEqual([1, 1, 1]);
    for (let i = 0; i < 10; i++) {
      s.frame();
    }
    expect(s.host.match.tick).toBe(ticks[0]);
    (s.peers[2] as PeerRig).driver.setPaused(false, 2);
    s.runUntil((ticks[0] ?? 0) + 60);
    s.drain();
    expect(seen).toEqual(['paused:1', 'resumed:2']);
    expect(disagreements(s)).toEqual([]);
  });

  it('a client behind the seals stalls, then catches up several ticks per frame', () => {
    const s = new Session({ peers: 2, seed: 5, latency: { min: 150, max: 450 } });
    const statuses = new Set<string>();
    let burst = 0;
    s.runUntil(150, () => {
      const c = s.peers[1] as PeerRig;
      statuses.add(c.driver.status());
      burst = Math.max(burst, c.lastSteps);
    });
    s.drain();
    expect(statuses.has('stalled')).toBe(true);
    expect(burst).toBeGreaterThan(1);
    expect(disagreements(s)).toEqual([]);
  });

  it('a late input is re-ticked to the next open tick, the same one on every peer', () => {
    const s = new Session({ peers: 2, seed: 6, latency: { min: 250, max: 300 }, inputRate: 0 });
    s.runUntil(40);
    const c = s.peers[1] as PeerRig;
    const hero = c.match.perception.heroes.find((h) => h.slot === 1)?.id ?? 0;
    const wanted = c.match.tick + s.delay;
    c.driver.submit(1, { kind: 'move', hero, x: 777, y: 3 });
    s.runUntil(125);
    s.drain();
    const find = (p: PeerRig): number[] =>
      p.driver
        .log()
        .seals.filter((seal) => seal.inputs.some((i) => i.cmd.kind === 'move' && i.cmd.x === 777))
        .map((seal) => seal.tick);
    const onHost = find(s.host);
    expect(onHost).toHaveLength(1);
    expect(onHost[0]).toBeGreaterThan(wanted);
    expect(find(c)).toEqual(onHost);
    expect(disagreements(s)).toEqual([]);
  });

  it('the host seals inputs only from the peer seated at the player, and refuses what peers may not send', () => {
    const s = new Session({ peers: 2, seed: 7, latency: { min: 10, max: 40 }, inputRate: 0 });
    s.runUntil(30);
    const hero = s.host.match.perception.heroes.find((h) => h.slot === 0)?.id ?? 0;
    const forged = (player: number, x: number): void =>
      s.peers[1]?.port.send('p0', {
        t: 'input',
        player,
        cmd: { kind: 'move', hero, x, y: 1 },
        wantTick: s.host.match.tick + 3,
      });
    forged(0, 901); // p1 is seated at 1, not 0
    forged(1, 902); // its own
    forged(3, 903); // nobody's
    s.peers[1]?.port.send('p0', {
      t: 'input',
      player: 1,
      cmd: { kind: 'control', op: 'drive', slot: 1, by: 'bot' },
      wantTick: 40,
    });
    s.runUntil(80);
    s.drain();
    const sealed = s.host.driver
      .log()
      .seals.flatMap((seal) => seal.inputs)
      .filter((i) => i.cmd.kind === 'move' && i.cmd.y === 1)
      .map((i) => [i.player, i.cmd.kind === 'move' ? i.cmd.x : -1]);
    expect(sealed).toEqual([[1, 902]]);
    expect(s.hub.refused()).toBe(1); // the control command never decodes
    expect(s.host.driver.log().seals.some((seal) => seal.inputs.some((i) => i.cmd.kind === 'control'))).toBe(false);
  });

  it('a bargain accept sent as a human-seated or card-less slot is not sealed', () => {
    const s = new Session({ peers: 2, seed: 8, latency: { min: 10, max: 40 }, inputRate: 0 });
    s.runUntil(20);
    const accept = { kind: 'bargain', op: 'accept', offer: 1, card: 'nope' } as const;
    s.peers[1]?.port.send('p0', { t: 'input', player: 0, cmd: accept, wantTick: 25 }); // seated to the host
    s.peers[1]?.port.send('p0', { t: 'input', player: 3, cmd: accept, wantTick: 25 }); // bot slot, no such card
    s.runUntil(60);
    s.drain();
    expect(s.host.driver.log().seals.some((seal) => seal.inputs.some((i) => i.cmd.kind === 'bargain'))).toBe(false);
  });

  it('a dropped peer hands its hero to a bot at a sealed tick, and the rest agree', () => {
    const s = new Session({ peers: 3, seed: 10, latency: { min: 10, max: 80 } });
    const clientNotices: string[] = [];
    s.peers[1]?.driver.onNotice((n) => {
      if (n.kind === 'dropped') {
        clientNotices.push(`dropped:${n.slots.join(',')}`);
      }
    });
    s.runUntil(100);
    s.cut(s.peers[2] as PeerRig);
    s.runUntil(200);
    s.drain();
    const drives = s.host.driver
      .log()
      .seals.flatMap((seal) => seal.inputs.map((i) => ({ tick: seal.tick, ...i })))
      .filter((i) => i.cmd.kind === 'control');
    expect(drives).toHaveLength(1);
    expect(drives[0]?.player).toBe(SYSTEM_PLAYER);
    expect(drives[0]?.cmd).toEqual({ kind: 'control', op: 'drive', slot: 2, by: 'bot' });
    expect(clientNotices).toEqual(['dropped:2']);
    expect(disagreements(s)).toEqual([]);
  });

  it('a host drop ends the game for the clients', () => {
    const s = new Session({ peers: 3, seed: 11, latency: { min: 10, max: 60 } });
    const notices: string[] = [];
    s.peers[1]?.driver.onNotice((n) => notices.push(n.kind));
    s.runUntil(60);
    s.cut(s.host);
    for (let i = 0; i < 30; i++) {
      s.frame();
    }
    for (const p of s.peers.slice(1)) {
      expect(p.driver.status()).toBe('ended');
      expect(p.driver.endReason()).toBe('host-left');
    }
    expect(notices).toContain('hostLeft');
    const frozen = s.peers.slice(1).map((p) => p.match.tick);
    for (let i = 0; i < 20; i++) {
      s.frame();
    }
    expect(s.peers.slice(1).map((p) => p.match.tick)).toEqual(frozen);
  });
});
