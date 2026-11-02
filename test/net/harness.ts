// Loopback harness for the lockstep tests: a hub that implements `Transport` for N peers with seeded
// latency and jitter, reliable and ordered per link (so reordering only happens across peers), a
// virtual clock, and a `Session` that runs one Match per peer the way the shell does (a wall-clock
// target, gated by the driver). Messages go through encodeMsg / decodeMsg, so the wire format is
// exercised too. Nothing here is gameplay: scripted inputs are arbitrary legal commands.

import { defaultConfig } from '../../src/client/config.ts';
import { specFromConfig } from '../../src/client/setup.ts';
import { canStep, DEFAULT_FRAME_OPTIONS, newFrameClock, planFrame, stepBudget } from '../../src/client/shell/frame.ts';
import type { FrameClock } from '../../src/client/shell/types.ts';
import type { ConfigOverrides } from '../../src/content/overrides.ts';
import type { Match } from '../../src/match/match.ts';
import type { GameSpec } from '../../src/match/run.ts';
import { buildMatch } from '../../src/match/run.ts';
import { netDriver } from '../../src/net/driver.ts';
import { replayInputs } from '../../src/net/inputlog.ts';
import type { LockstepDriver } from '../../src/net/lockstep.ts';
import type { PeerId } from '../../src/net/types.ts';
import { checkpoints } from '../../src/replay/verify.ts';
import type { Command } from '../../src/sim/commands.ts';
import { Hub, type Latency, type Port, rng } from './hub.ts';

const FRAME_MS = 1000 / 30;

export interface PeerRig {
  readonly id: PeerId;
  readonly slot: number;
  readonly match: Match;
  readonly driver: LockstepDriver;
  readonly port: Port;
  /** Steps taken in the most recent frame (catch-up shows as > 1). */
  lastSteps: number;
  dropped: boolean;
  /** The shell's frame clock for this peer. */
  clock: FrameClock;
}

export interface SessionOptions {
  readonly peers: number;
  readonly seed: number;
  readonly latency: Latency;
  readonly delay?: number;
  /** Chance per frame that a peer sends a scripted input. */
  readonly inputRate?: number;
  /** A config patch for the spec (e.g. an early bargain offer). */
  readonly overrides?: ConfigOverrides;
}

/**
 * One frame of the shell's step loop for a peer, through the same pure functions the shell uses
 * (`planFrame`, `stepBudget`, `canStep`), so a halting bug in the shell's rule shows up here (M2).
 */
function stepPeer(p: PeerRig, nowMs: number): void {
  const plan = planFrame(p.clock, nowMs, { ...DEFAULT_FRAME_OPTIONS, paused: p.driver.status() === 'paused' });
  p.clock = plan.clock;
  const budget = stepBudget(plan.steps, p.match.tick, p.driver.steppable());
  let steps = 0;
  while (steps < budget && !p.match.ended && canStep(p.match.tick, p.driver.steppable())) {
    p.driver.beforeStep(p.match.tick + 1);
    const events = p.match.step();
    p.driver.afterStep(events);
    steps += 1;
  }
  p.lastSteps = steps;
}

/** One networked game over the hub: peer 0 is the host. Hero slot i is played by peer i. */
export class Session {
  readonly hub: Hub;
  readonly spec: GameSpec;
  readonly peers: PeerRig[] = [];
  readonly delay: number;
  readonly #rand: () => number;
  readonly #inputRate: number;
  #frame = 0;

  constructor(o: SessionOptions) {
    this.hub = new Hub(o.seed, o.latency);
    this.#rand = rng(o.seed ^ 0x5a_5a);
    this.#inputRate = o.inputRate ?? 0.15;
    this.delay = o.delay ?? 3;
    const humans = Array.from({ length: o.peers }, (_, i) => i);
    this.spec = {
      ...specFromConfig({ ...defaultConfig(), seed: o.seed }),
      mode: 'schedule',
      maxTicks: 100_000,
      hashEvery: 30,
      humans,
      ...(o.overrides === undefined ? {} : { overrides: o.overrides }),
    };
    const ids = humans.map((i) => `p${i}`);
    for (const id of ids.slice(1)) {
      this.hub.connect('p0', id);
    }
    const start = { spec: this.spec, seats: ids.map((peer, i) => ({ peer, players: [i] })), delay: this.delay };
    ids.forEach((id, slot) => {
      const match = buildMatch(this.spec);
      const port = this.hub.port(id);
      const driver = netDriver({ transport: port, start, host: 'p0', now: () => this.hub.now })(match);
      this.peers.push({ id, slot, match, driver, port, lastSteps: 0, dropped: false, clock: newFrameClock() });
    });
  }

  get host(): PeerRig {
    return this.peers[0] as PeerRig;
  }

  /** Scripted human input: an arbitrary legal move for the peer's hero. */
  #script(p: PeerRig): void {
    if (this.#rand() >= this.#inputRate || p.dropped) {
      return;
    }
    const hero = p.match.perception.heroes.find((h) => h.slot === p.slot);
    if (hero === undefined) {
      return;
    }
    const cmd: Command = { kind: 'move', hero: hero.id, x: this.#rand() * 40, y: this.#rand() * 40 };
    p.driver.submit(p.slot, cmd);
  }

  /** One frame (1/30 s): deliver due messages, then each peer scripts and steps, in a seeded order. */
  frame(hostMayStep = true): void {
    this.#frame += 1;
    this.hub.advance(this.#frame * FRAME_MS);
    const order = this.peers.filter((p) => !p.dropped).sort(() => this.#rand() - 0.5);
    const nowMs = this.#frame * FRAME_MS;
    for (const p of order) {
      if (p === this.host && !hostMayStep) {
        continue;
      }
      this.#script(p);
      stepPeer(p, nowMs);
    }
  }

  /** Runs frames until the host reaches `tick` (or `maxFrames` pass). */
  runUntil(tick: number, onFrame?: (frame: number) => void, maxFrames = tick * 40): void {
    for (let i = 0; i < maxFrames && this.host.match.tick < tick; i++) {
      this.frame();
      onFrame?.(this.#frame);
    }
  }

  /** Stops the host and lets the others catch up with it (and the hub empty). */
  drain(maxFrames = 600): void {
    for (let i = 0; i < maxFrames; i++) {
      this.frame(false);
      if (this.peers.every((p) => p.dropped || p.match.tick >= this.host.match.tick)) {
        this.frame(false);
        return;
      }
    }
  }

  cut(p: PeerRig): void {
    p.dropped = true;
    this.hub.cut(p.id);
  }

  get frames(): number {
    return this.#frame;
  }
}

function hashesOf(p: PeerRig): string[] {
  return p.driver.log().hashes.map((h) => `${h.tick}:${h.hash}`);
}

/**
 * What is wrong, if anything: every live peer should equal the host and the replay of the host's seals.
 * Returns problems rather than asserting, so the check can be shared (empty = agreement).
 */
export function disagreements(s: Session): string[] {
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
