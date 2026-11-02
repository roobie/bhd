// Lockstep core invariants over the loopback hub: every peer sees the same hashes, equal to a replay of
// the host's seals, whatever the arrival order. Nothing asserts how a game plays (D-4E4QRJ7N6LIGZDSD).

import { describe, expect, it } from 'vitest';
import { DEFAULT_FRAME_OPTIONS, newFrameClock, planFrame, stepBudget } from '../../src/client/shell/frame.ts';
import { type Command, SYSTEM_PLAYER } from '../../src/sim/commands.ts';
import { disagreements, type PeerRig, Session } from './harness.ts';

const TICKS = 330;

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

  for (const [seed, latency] of [
    [21, { min: 10, max: 60 }],
    [22, { min: 100, max: 400 }],
    [23, { min: 5, max: 600 }],
  ] as const) {
    it(`every peer halts at exactly the tick the host paused at (seed ${seed}, latency ${latency.min}-${latency.max} ms)`, () => {
      const s = new Session({ peers: 4, seed, latency });
      s.runUntil(50);
      let hostTick: number | undefined;
      s.host.driver.onNotice((n) => {
        if (n.kind === 'paused') {
          hostTick = s.host.match.tick;
        }
      });
      // Peer 3, the one furthest from the host in time, asks; the others must step on to the host's tick.
      (s.peers[3] as PeerRig).driver.setPaused(true, 3);
      for (let i = 0; i < 400 && s.peers.some((p) => p.driver.status() !== 'paused'); i++) {
        s.frame();
      }
      for (let i = 0; i < 30; i++) {
        s.frame();
      }
      expect(hostTick).toBeDefined();
      expect(s.peers.map((p) => p.match.tick)).toEqual([hostTick, hostTick, hostTick, hostTick]);
      expect(s.peers.map((p) => p.driver.status())).toEqual(['paused', 'paused', 'paused', 'paused']);
    });
  }

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

  /** A two-peer game run until an early bargain offer holds a card of a bot-driven hero; slots 2 and 3 stay bots. */
  function offerSession(): { s: Session; offer: number; botSlot: number; accept: Command } {
    const s = new Session({
      peers: 2,
      seed: 5,
      latency: { min: 10, max: 60 },
      inputRate: 0.05,
      overrides: { game: { bargains: { afterWaves: [1] } } },
    });
    const open = (): { id: number; cards: readonly { bargain: string; hero: number }[] } | undefined =>
      s.host.match.sim.bargains?.offers[0];
    for (let i = 0; i < 4000 && open() === undefined; i++) {
      s.frame();
    }
    const offer = open();
    expect(offer, 'the early offer opened').toBeDefined();
    const { heroes } = s.host.match.perception;
    const card = offer?.cards.find((c) => {
      const slot = heroes.find((h) => h.id === c.hero)?.slot;
      return slot !== undefined && !s.host.match.driven.includes(slot);
    });
    expect(card, 'the offer holds a card of a bot-driven hero').toBeDefined();
    const botSlot = heroes.find((h) => h.id === card?.hero)?.slot as number;
    const accept: Command = {
      kind: 'bargain',
      op: 'accept',
      offer: offer?.id as number,
      card: card?.bargain as string,
    };
    return { s, offer: offer?.id as number, botSlot, accept };
  }

  const sealedBargains = (s: Session): { player: number }[] =>
    s.host.driver
      .log()
      .seals.flatMap((seal) => seal.inputs)
      .filter((i) => i.cmd.kind === 'bargain');

  it("a human accepts a bot hero's bargain card: the host seals it as the slot player and every peer agrees", () => {
    const { s, offer, botSlot, accept } = offerSession();
    // Peer 1 (a client seated at slot 1) resolves a card that belongs to the bot hero of `botSlot`.
    s.peers[1]?.driver.submit(botSlot, accept);
    s.runUntil(s.host.match.tick + 120);
    s.drain();
    const sealed = sealedBargains(s);
    expect(sealed).toHaveLength(1);
    expect(sealed[0]?.player).toBe(botSlot);
    expect(s.host.match.sim.bargains?.offers.some((o) => o.id === offer)).toBe(false);
    expect(disagreements(s)).toEqual([]);
  });

  it('racing and repeated accepts of one card seal once, and an unseated peer cannot accept at all', () => {
    const { s, botSlot, accept } = offerSession();
    // A peer the host never seated (a spectator link): its accept is refused outright.
    s.hub.connect('p0', 'px');
    s.hub.port('px').send('p0', { t: 'input', player: botSlot, cmd: accept, wantTick: s.host.match.tick + 3 });
    s.runUntil(s.host.match.tick + 40);
    expect(sealedBargains(s)).toHaveLength(0);
    // Both seated peers race the same accept, the client sends it five times over.
    for (let i = 0; i < 5; i++) {
      s.peers[1]?.driver.submit(botSlot, accept);
    }
    s.host.driver.submit(botSlot, accept);
    s.runUntil(s.host.match.tick + 80);
    s.drain();
    expect(sealedBargains(s)).toHaveLength(1);
    expect(disagreements(s)).toEqual([]);
  });

  it('a flood of inputs is capped per player per tick, and every seal still decodes on the clients', () => {
    const s = new Session({ peers: 3, seed: 12, latency: { min: 10, max: 60 }, inputRate: 0 });
    s.runUntil(30);
    const hero = s.peers[1]?.match.perception.heroes.find((h) => h.slot === 1)?.id ?? 0;
    const port = s.peers[1]?.port;
    for (let i = 0; i < 2000; i++) {
      port?.send('p0', {
        t: 'input',
        player: 1,
        cmd: { kind: 'move', hero, x: i, y: 2 },
        wantTick: s.host.match.tick + 3,
      });
    }
    // The host's own inputs: NaN and Infinity never encode, a 70k summon def is never queued.
    const host = s.host.driver;
    host.submit(0, { kind: 'move', hero: 1, x: Number.NaN, y: 1 });
    host.submit(0, { kind: 'move', hero: 1, x: 1, y: Number.POSITIVE_INFINITY });
    host.submit(SYSTEM_PLAYER, { kind: 'summon', def: 'x'.repeat(70_000), count: 1 });
    s.runUntil(120);
    s.drain();
    const perTick = s.host.driver.log().seals.map((seal) => seal.inputs.filter((i) => i.player === 1).length);
    expect(Math.max(...perTick)).toBeLessThanOrEqual(8);
    expect(Math.max(...perTick)).toBeGreaterThan(0);
    expect(s.hub.refused()).toBe(0);
    expect(disagreements(s)).toEqual([]);
  });

  it('a client ends loudly on a message from the host that does not decode, instead of stalling', () => {
    const s = new Session({ peers: 2, seed: 13, latency: { min: 10, max: 40 } });
    s.runUntil(30);
    const client = s.peers[1] as PeerRig;
    const notices: string[] = [];
    client.driver.onNotice((n) => notices.push(n.kind));
    const inputs = Array.from({ length: 300 }, () => ({ player: 0, cmd: { kind: 'callWave' } as Command }));
    s.host.port.send('p1', { t: 'seal', tick: 9999, inputs });
    for (let i = 0; i < 20; i++) {
      s.frame();
    }
    expect(client.driver.status()).toBe('ended');
    expect(client.driver.endReason()).toBe('bad-message');
    expect(notices).toContain('broken');
    expect(s.hub.refused()).toBe(1);
  });

  it('hash messages for ticks the host has not reached, off the checkpoint grid, or repeated, are ignored', () => {
    const s = new Session({ peers: 2, seed: 14, latency: { min: 10, max: 40 }, inputRate: 0 });
    s.runUntil(70);
    const port = s.peers[1]?.port;
    for (const tick of [1, 31, 3000, 30_000_000]) {
      port?.send('p0', { t: 'hash', tick, hash: 'junk' });
    }
    // A wrong hash on a real, already settled checkpoint changes nothing either.
    port?.send('p0', { t: 'hash', tick: 30, hash: 'junk' });
    s.runUntil(130);
    s.drain();
    expect(s.host.driver.status()).not.toBe('desynced');
    expect(disagreements(s)).toEqual([]);
  });

  it('inputs sent during a pause are held and sealed after the resume, identically everywhere', () => {
    const s = new Session({ peers: 3, seed: 15, latency: { min: 10, max: 120 }, inputRate: 0 });
    s.runUntil(40);
    const pauser = s.peers[1] as PeerRig;
    pauser.driver.setPaused(true, 1);
    for (let i = 0; i < 6; i++) {
      s.frame();
    }
    // The pauser's toggles are rate limited: a resume right after its pause is ignored.
    pauser.driver.setPaused(false, 1);
    for (let i = 0; i < 14; i++) {
      s.frame();
    }
    expect(s.host.driver.status()).toBe('paused');
    const at = s.host.match.tick;
    const hero = s.peers[2]?.match.perception.heroes.find((h) => h.slot === 2)?.id ?? 0;
    s.peers[2]?.driver.submit(2, { kind: 'move', hero, x: 555, y: 5 });
    for (let i = 0; i < 40; i++) {
      s.frame();
    }
    expect(s.peers.map((p) => p.match.tick)).toEqual([at, at, at]);
    const sealed555 = (): number =>
      s.host.driver.log().seals.filter((seal) => seal.inputs.some((i) => i.cmd.kind === 'move' && i.cmd.x === 555))
        .length;
    expect(sealed555()).toBe(0);
    pauser.driver.setPaused(false, 1);
    s.runUntil(at + 100);
    s.drain();
    const sealedAt = s.host.driver
      .log()
      .seals.filter((seal) => seal.inputs.some((i) => i.cmd.kind === 'move' && i.cmd.x === 555))
      .map((seal) => seal.tick);
    expect(sealedAt).toHaveLength(1);
    expect(sealedAt[0]).toBeGreaterThan(at);
    expect(disagreements(s)).toEqual([]);
  });

  it('the host runs several ticks in one frame after a long one, like solo', () => {
    const s = new Session({ peers: 2, seed: 16, latency: { min: 10, max: 40 } });
    s.runUntil(30);
    expect(s.host.driver.steppable()).toBe(Number.POSITIVE_INFINITY);
    const plan = planFrame(newFrameClock(), 0, DEFAULT_FRAME_OPTIONS);
    const later = planFrame(plan.clock, 150, DEFAULT_FRAME_OPTIONS);
    expect(later.steps).toBeGreaterThan(3);
    expect(stepBudget(later.steps, s.host.match.tick, s.host.driver.steppable())).toBe(later.steps);
    s.host.driver.setPaused(true, 0);
    expect(stepBudget(later.steps, s.host.match.tick, s.host.driver.steppable())).toBe(0);
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
