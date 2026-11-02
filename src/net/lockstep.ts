// Lockstep core (wave 10): the host sequencer and the client driver, both `TickDriver`s (shell/types.ts).
// Pure: the clock is injected and nothing reads wall time. Both ends follow rule R1: only
// `beforeStep(T)` calls `sim.command` for human and system players, submitting tick T's sealed inputs
// in seal order, so every peer assigns the same (player, seq) and replays of the seals agree.
//
// Star topology. Clients send `input {player, cmd, wantTick}` to the host. The host seals tick T in
// `beforeStep(T)` (just before it runs T) with every input that wants a tick <= T and has not been
// sealed yet, sorted by player then arrival, and broadcasts the seal. An input that arrives for a
// tick already sealed is re-ticked to the next open tick. A client steps only sealed ticks.
//
// Pause is a tick boundary: the host broadcasts `pause` right after the last seal it sent, and the
// link is ordered, so each client halts at the highest tick it holds when `pause` arrives, the same
// tick everywhere. A dropped peer's players are handed to bots by a sealed `control drive->bot`
// command from SYSTEM_PLAYER at the next open tick. A host drop ends the game for the clients.
// Every `checkEvery` ticks each peer sends its state hash; the host compares and, on a mismatch,
// broadcasts `desync`: everyone halts and can dump its log (`dump`, see inputlog.ts).

import type { DriverStatus, TickDriver } from '../client/shell/types.ts';
import type { Match } from '../match/match.ts';
import type { GameSpec } from '../match/run.ts';
import type { Command } from '../sim/commands.ts';
import { SYSTEM_PLAYER } from '../sim/commands.ts';
import type { SimEvent } from '../sim/events.ts';
import type { InputLog, InputRecorder } from './inputlog.ts';
import { createRecorder, encodeInputLog } from './inputlog.ts';
import type { PeerId, SealedInput, SeatAssignment, Transport, Unsubscribe, WireMsg } from './types.ts';
import { isPeerCommand } from './types.ts';

/** Ticks between the hash checkpoints peers exchange. */
export const CHECK_EVERY = 30;
/** How far past the sealed tick a peer may ask an input to apply (bounds hostile `wantTick`s). */
const MAX_AHEAD = 600;
const HERO_SLOTS = 4;

export interface LockstepOptions {
  readonly match: Match;
  readonly transport: Transport;
  /** Input delay in ticks (the `start` message's `delay`). */
  readonly delay: number;
  /**
   * Players (hero slots) this peer plays: the ones it may pause as. `submit()` is NOT filtered by it:
   * a human accepting a card of a bot-driven hero submits as that hero's slot (H1), and the host decides.
   */
  readonly players: readonly number[];
  /** Milliseconds clock, injected. */
  readonly now: () => number;
  /** The spec the match was built from (written into dumps). */
  readonly spec: GameSpec;
  /**
   * Which peer controls which players, from the `start` message. The host accepts an input from a peer
   * only for players seated to it, except a bargain `accept` sent as a slot that is bot-driven in the
   * host's Match at seal time whose card's hero is that slot's hero (H1); the seal records the slot player.
   */
  readonly seats: ReadonlyMap<PeerId, readonly number[]>;
  /** Ticks between hash exchanges; default `CHECK_EVERY`. */
  readonly checkEvery?: number;
}

/** Same shape as the host's; kept as a name for the stub's signature. */
export type HostOptions = LockstepOptions;

export interface ClientOptions extends LockstepOptions {
  /** The host's peer id (the only peer a client talks to). */
  readonly host: PeerId;
}

/** Why a session ended. */
export type EndReason = 'game' | 'host-left' | 'closed';

/** What happened, for callouts and panels (the shape E2's `TickDriver.onNotice` uses). */
export type DriverNotice =
  | { readonly kind: 'paused' | 'resumed'; readonly by: number }
  | { readonly kind: 'dropped'; readonly slots: number[] }
  | { readonly kind: 'hostLeft' }
  | { readonly kind: 'desync'; readonly tick: number }
  | { readonly kind: 'calledWave'; readonly by: number };

/** A `TickDriver` plus what the shell needs from a networked game. */
export interface LockstepDriver extends TickDriver {
  /** Asks everyone to pause or resume (`by`: the asking peer's player); takes effect when sealed into the stream. */
  setPaused: (on: boolean, by: number) => void;
  /** Who paused, while paused. */
  pausedBy: () => number | undefined;
  /** Tick of the first mismatching checkpoint, once desynced. */
  desyncTick: () => number | undefined;
  /** Set once the session is over (the game's own end is `'game'`). */
  endReason: () => EndReason | undefined;
  /** How long the driver has been waiting for a seal, in injected-clock ms (0 when not stalled). */
  stalledMs: () => number;
  onNotice: (cb: (n: DriverNotice) => void) => Unsubscribe;
  /** This peer's log so far. */
  log: () => InputLog;
  /** The NDJSON dump of the log (what a desync leaves behind). */
  dump: () => string | undefined;
  /** Leaves the session: says goodbye and unsubscribes. */
  dispose: () => void;
}

// ---------------------------------------------------------------------------------------------
// Shared parts
// ---------------------------------------------------------------------------------------------

interface Shared {
  readonly recorder: InputRecorder;
  readonly checkEvery: number;
  notice: (n: DriverNotice) => void;
  onNotice: (cb: (n: DriverNotice) => void) => Unsubscribe;
  /** Submits a sealed tick to the sim (R1) and records it. */
  apply: (match: Match, tick: number, inputs: readonly SealedInput[]) => void;
  /** Records the step's events; returns the checkpoints that are due for exchange. */
  observe: (events: readonly SimEvent[]) => { tick: number; hash: string }[];
}

function shared(o: LockstepOptions): Shared {
  const seats: SeatAssignment[] = [...o.seats].map(([peer, players]) => ({ peer, players: [...players] }));
  const recorder = createRecorder({ spec: o.spec, seats, delay: o.delay, peer: o.transport.self });
  const listeners = new Set<(n: DriverNotice) => void>();
  const checkEvery = o.checkEvery ?? CHECK_EVERY;
  const notice = (n: DriverNotice): void => {
    for (const cb of [...listeners]) {
      cb(n);
    }
  };
  return {
    recorder,
    checkEvery,
    notice,
    onNotice: (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    apply: (match, tick, inputs) => {
      recorder.seal({ tick, inputs });
      for (const input of inputs) {
        match.sim.command(input.player, input.cmd, tick);
        if (input.cmd.kind === 'callWave') {
          notice({ kind: 'calledWave', by: input.player });
        }
      }
    },
    observe: (events) => {
      recorder.events(events);
      const due: { tick: number; hash: string }[] = [];
      for (const e of events) {
        if (e.kind === 'hash') {
          recorder.hash(e.tick, e.stateHash);
          if (e.tick % checkEvery === 0) {
            due.push({ tick: e.tick, hash: e.stateHash });
          }
        }
      }
      return due;
    },
  };
}

function isAccept(cmd: Command): boolean {
  return cmd.kind === 'bargain' && cmd.op === 'accept';
}

// ---------------------------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------------------------

interface Queued extends SealedInput {
  /** Sent by a peer that is not seated at `player` (a bot hero's card accept): re-checked at seal time. */
  readonly foreign: boolean;
  /** Arrival number: the tiebreak within a player, so the seal order is the send order. */
  readonly n: number;
}

/** The host: seals ticks, compares hashes, issues control commands as `SYSTEM_PLAYER`. */
export function createHostDriver(o: HostOptions): LockstepDriver {
  const { match, transport } = o;
  const s = shared(o);
  const seats = new Map<PeerId, readonly number[]>(o.seats);
  const down = new Set<PeerId>();
  /** Open ticks' inputs, by the tick they will seal into. */
  const buckets = new Map<number, Queued[]>();
  let sealed = match.tick;
  let arrival = 0;
  let paused: number | undefined;
  let desynced: number | undefined;
  let ended: EndReason | undefined;
  /** tick -> host hash, and tick -> peer -> hash received before the host's own. */
  const mine = new Map<number, string>();
  const theirs = new Map<number, Map<PeerId, string>>();

  const livePeers = (): number => [...seats.keys()].filter((p) => p !== transport.self && !down.has(p)).length;

  /** Who may submit as `player`: its seat holder, or (H1) anyone for a bot hero's card accept, checked at seal time. */
  function mayCommand(peer: PeerId, player: number, cmd: Command): boolean {
    if (down.has(peer)) {
      return false;
    }
    if (peer === transport.self) {
      return true;
    }
    if (!(player < HERO_SLOTS && isPeerCommand(cmd))) {
      return false;
    }
    return seats.get(peer)?.includes(player) === true || isAccept(cmd);
  }

  /** At seal time: is this accept, sent by a peer not seated at `player`, for a card of the bot-driven hero of slot `player`? */
  function botHeroAccept(player: number, cmd: Command): boolean {
    if (cmd.kind !== 'bargain' || cmd.op !== 'accept' || match.driven.includes(player)) {
      return false;
    }
    const hero = match.perception.heroes.find((h) => h.slot === player);
    const offer = match.sim.bargains?.offers.find((x) => x.id === cmd.offer);
    return hero !== undefined && offer?.cards.some((c) => c.bargain === cmd.card && c.hero === hero.id) === true;
  }

  function enqueue(tick: number, player: number, cmd: Command, foreign = false): void {
    const list = buckets.get(tick) ?? [];
    list.push({ player, cmd, n: arrival, foreign });
    arrival += 1;
    buckets.set(tick, list);
  }

  function accept(peer: PeerId, player: number, cmd: Command, wantTick: number): void {
    if (!mayCommand(peer, player, cmd)) {
      return;
    }
    const tick = Math.min(Math.max(wantTick, sealed + 1), sealed + MAX_AHEAD);
    enqueue(tick, player, cmd, isAccept(cmd) && player < HERO_SLOTS && seats.get(peer)?.includes(player) !== true);
  }

  function declareDesync(tick: number): void {
    if (desynced !== undefined) {
      return;
    }
    desynced = tick;
    transport.broadcast({ t: 'desync', tick });
    s.notice({ kind: 'desync', tick });
  }

  function compare(tick: number): void {
    const want = mine.get(tick);
    const got = theirs.get(tick);
    if (want === undefined || got === undefined) {
      return;
    }
    for (const hash of got.values()) {
      if (hash !== want) {
        declareDesync(tick);
        return;
      }
    }
    if (got.size >= livePeers()) {
      mine.delete(tick);
      theirs.delete(tick);
    }
  }

  function dropPeer(peer: PeerId): void {
    const players = seats.get(peer);
    if (players === undefined || peer === transport.self || down.has(peer)) {
      return;
    }
    down.add(peer);
    const atTick = sealed + 1;
    for (const slot of players.filter((p) => p < HERO_SLOTS)) {
      enqueue(atTick, SYSTEM_PLAYER, { kind: 'control', op: 'drive', slot, by: 'bot' });
    }
    transport.broadcast({ t: 'drop', peer, atTick });
    s.notice({ kind: 'dropped', slots: players.filter((p) => p < HERO_SLOTS) });
    for (const [tick, got] of theirs) {
      got.delete(peer);
      compare(tick);
    }
  }

  function setPause(by: number | undefined, byPlayer: number): void {
    if (desynced !== undefined || ended !== undefined) {
      return;
    }
    if (by !== undefined && paused === undefined) {
      paused = by;
      transport.broadcast({ t: 'pause', by });
      s.notice({ kind: 'paused', by });
    } else if (by === undefined && paused !== undefined) {
      paused = undefined;
      transport.broadcast({ t: 'resume', by: byPlayer });
      s.notice({ kind: 'resumed', by: byPlayer });
    }
  }

  const offMessage = transport.onMessage((from, msg) => {
    switch (msg.t) {
      case 'input':
        accept(from, msg.player, msg.cmd, msg.wantTick);
        break;
      case 'pause':
        if (seats.get(from)?.includes(msg.by) === true && !down.has(from)) {
          setPause(msg.by, msg.by);
        }
        break;
      case 'resume':
        if (seats.get(from)?.includes(msg.by) === true && !down.has(from)) {
          setPause(undefined, msg.by);
        }
        break;
      case 'hash': {
        if (down.has(from) || !seats.has(from)) {
          break;
        }
        const got = theirs.get(msg.tick) ?? new Map<PeerId, string>();
        got.set(from, msg.hash);
        theirs.set(msg.tick, got);
        compare(msg.tick);
        break;
      }
      case 'bye':
        dropPeer(from);
        break;
      case 'ping':
        transport.send(from, { t: 'pong', n: msg.n });
        break;
      default:
        break;
    }
  });
  const offPeer = transport.onPeer((peer, state) => {
    if (state === 'down') {
      dropPeer(peer);
    }
  });

  const halted = (): boolean => paused !== undefined || desynced !== undefined || ended !== undefined || match.ended;

  return {
    submit(player, cmd): void {
      accept(transport.self, player, cmd, match.tick + o.delay);
    },
    steppable: () => (halted() ? match.tick : match.tick + 1),
    beforeStep(tick): void {
      if (tick !== sealed + 1) {
        throw new RangeError(`host seals tick ${sealed + 1}, asked for ${tick}`);
      }
      const due: Queued[] = [];
      for (const [t, list] of buckets) {
        if (t <= tick) {
          due.push(...list);
          buckets.delete(t);
        }
      }
      due.splice(0, due.length, ...due.filter((q) => !q.foreign || botHeroAccept(q.player, q.cmd)));
      due.sort((a, b) => a.player - b.player || a.n - b.n);
      const inputs: SealedInput[] = due.map(({ player, cmd }) => ({ player, cmd }));
      sealed = tick;
      transport.broadcast({ t: 'seal', tick, inputs });
      s.apply(match, tick, inputs);
    },
    afterStep(events): void {
      for (const { tick, hash } of s.observe(events)) {
        mine.set(tick, hash);
        compare(tick);
      }
      if (match.ended && ended === undefined) {
        ended = 'game';
      }
    },
    status: (): DriverStatus => {
      if (ended === 'closed') {
        return 'ended';
      }
      if (desynced !== undefined) {
        return 'desynced';
      }
      if (paused !== undefined) {
        return 'paused';
      }
      return match.ended || ended !== undefined ? 'ended' : 'running';
    },
    setPaused: (on, by) => {
      if (seats.get(transport.self)?.includes(by) === true) {
        setPause(on ? by : undefined, by);
      }
    },
    pausedBy: () => paused,
    desyncTick: () => desynced,
    endReason: () => ended,
    stalledMs: () => 0,
    onNotice: s.onNotice,
    log: () => s.recorder.snapshot(),
    dump: () => encodeInputLog(s.recorder.snapshot()),
    dispose(): void {
      if (ended !== 'closed') {
        ended = 'closed';
        transport.broadcast({ t: 'bye' });
        offMessage();
        offPeer();
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------------------------

/** A client: sends inputs to the host, steps only sealed ticks. */
export function createClientDriver(o: ClientOptions): LockstepDriver {
  const { match, transport, host } = o;
  const s = shared(o);
  /** Received seals not yet applied. */
  const pending = new Map<number, readonly SealedInput[]>();
  /** Highest tick such that every tick up to it has been received. */
  let sealed = match.tick;
  let pauseAt: { by: number; tick: number } | undefined;
  let desynced: number | undefined;
  let ended: EndReason | undefined;
  let stallSince: number | undefined;

  const end = (reason: EndReason): void => {
    if (ended === undefined) {
      ended = reason;
      if (reason === 'host-left') {
        s.notice({ kind: 'hostLeft' });
      }
    }
  };

  /** Pause, resume, desync and drop notices from the host. */
  function control(msg: WireMsg): void {
    if (msg.t === 'pause' && pauseAt === undefined) {
      // In order with the seals: the highest tick held now is the boundary every peer halts at.
      pauseAt = { by: msg.by, tick: sealed };
      s.notice({ kind: 'paused', by: msg.by });
    } else if (msg.t === 'resume' && pauseAt !== undefined) {
      pauseAt = undefined;
      s.notice({ kind: 'resumed', by: msg.by });
    } else if (msg.t === 'desync' && desynced === undefined) {
      desynced = msg.tick;
      s.notice({ kind: 'desync', tick: msg.tick });
    } else if (msg.t === 'drop') {
      // For the UI only (L5): the sealed control command does the handover.
      s.notice({ kind: 'dropped', slots: (o.seats.get(msg.peer) ?? []).filter((p) => p < HERO_SLOTS) });
    }
  }

  const offMessage = transport.onMessage((from, msg) => {
    if (from !== host) {
      return;
    }
    switch (msg.t) {
      case 'seal':
        if (msg.tick > sealed && !pending.has(msg.tick)) {
          pending.set(msg.tick, msg.inputs);
          while (pending.has(sealed + 1)) {
            sealed += 1;
          }
        }
        break;
      case 'pause':
      case 'resume':
      case 'desync':
      case 'drop':
        control(msg);
        break;
      case 'bye':
        end('host-left');
        break;
      case 'ping':
        transport.send(host, { t: 'pong', n: msg.n });
        break;
      default:
        break;
    }
  });
  const offPeer = transport.onPeer((peer, state) => {
    if (peer === host && state === 'down') {
      end('host-left');
    }
  });

  const limit = (): number => {
    if (desynced !== undefined || ended !== undefined || match.ended) {
      return match.tick;
    }
    return Math.max(match.tick, pauseAt === undefined ? sealed : Math.min(sealed, pauseAt.tick));
  };

  const myPlayers = (by: number): boolean => o.players.includes(by);

  return {
    submit(player, cmd): void {
      if (ended === undefined) {
        transport.send(host, { t: 'input', player, cmd, wantTick: match.tick + o.delay });
      }
    },
    steppable(): number {
      const top = limit();
      const waiting =
        top <= match.tick && pauseAt === undefined && desynced === undefined && ended === undefined && !match.ended;
      if (waiting) {
        stallSince ??= o.now();
      } else {
        stallSince = undefined;
      }
      return top;
    },
    beforeStep(tick): void {
      const inputs = pending.get(tick);
      if (inputs === undefined) {
        throw new RangeError(`tick ${tick} is not sealed`);
      }
      pending.delete(tick);
      s.apply(match, tick, inputs);
    },
    afterStep(events): void {
      for (const { tick, hash } of s.observe(events)) {
        transport.send(host, { t: 'hash', tick, hash });
      }
      if (match.ended && ended === undefined) {
        end('game');
      }
    },
    status: (): DriverStatus => {
      if (ended === 'host-left' || ended === 'closed') {
        return 'ended';
      }
      if (desynced !== undefined) {
        return 'desynced';
      }
      if (pauseAt !== undefined) {
        return 'paused';
      }
      if (match.ended || ended !== undefined) {
        return 'ended';
      }
      return sealed <= match.tick ? 'stalled' : 'running';
    },
    setPaused: (on, by) => {
      if (myPlayers(by) && ended === undefined) {
        transport.send(host, { t: on ? 'pause' : 'resume', by });
      }
    },
    pausedBy: () => pauseAt?.by,
    desyncTick: () => desynced,
    endReason: () => ended,
    stalledMs: () => (stallSince === undefined ? 0 : o.now() - stallSince),
    onNotice: s.onNotice,
    log: () => s.recorder.snapshot(),
    dump: () => encodeInputLog(s.recorder.snapshot()),
    dispose(): void {
      if (ended !== 'closed') {
        transport.send(host, { t: 'bye' });
        offMessage();
        offPeer();
        ended = 'closed';
      }
    },
  };
}
