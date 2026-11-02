// Network contract (wave 10, DESIGN §3): the Transport and Signalling seams, the wire protocol and
// its pure encode / decode-validate helpers. Owner: the lead (step 1); the step 2 slices
// (signalling, rtc, lockstep) build against this file and ask the lead to change it.
//
// Topology: a star, the host is the sequencer. Peers send `input` to the host; the host seals each
// tick as `seal {tick, inputs}` and broadcasts it; a peer steps a tick only once it holds that seal.
// Pure: no DOM, no clocks, no sockets. Messages are plain JSON.

import type { GameSpec, Mode } from '../match/run.ts';
import type { Command } from '../sim/commands.ts';
import { canonicalCommand, HERO_SLOTS, isValidCommand, SYSTEM_PLAYER } from '../sim/commands.ts';
import type { SimEvent } from '../sim/events.ts';

/** Wire protocol version; a `hello` with another value is refused. Bump on any change to `WireMsg`. */
export const PROTOCOL_VERSION = 2;

/** Opaque peer id handed out by signalling. */
export type PeerId = string;

// ---------------------------------------------------------------------------------------------
// Transport: reliable, ordered, message-based links between peers (WebRTC data channels in play,
// a loopback hub in tests). In the star, clients are connected to the host only.
// ---------------------------------------------------------------------------------------------

export type PeerState = 'up' | 'down';

/** Returned by every `on*` subscription: call to unsubscribe. */
export type Unsubscribe = () => void;

export interface Transport {
  /** This peer's id. */
  readonly self: PeerId;
  /** Sends to one connected peer; a message to a peer that is down is dropped. */
  send: (peer: PeerId, msg: WireMsg) => void;
  /** Sends to every connected peer. */
  broadcast: (msg: WireMsg) => void;
  /** Delivered messages, per sender in send order. Messages that fail `decodeMsg` never arrive. */
  onMessage: (cb: (from: PeerId, msg: WireMsg) => void) => Unsubscribe;
  /** A link came up or went down. */
  onPeer: (cb: (peer: PeerId, state: PeerState) => void) => Unsubscribe;
  /** Closes every link; no callbacks fire afterwards. */
  close: () => void;
}

// ---------------------------------------------------------------------------------------------
// Signalling: rooms, presence and relayed connection setup (a Worker in play, in-memory or
// BroadcastChannel locally). Lobby state itself travels over the Transport, not here.
// ---------------------------------------------------------------------------------------------

/** What peers relay to each other to set up a link. `data` is opaque to signalling. */
export interface SignalPayload {
  readonly kind: 'offer' | 'answer' | 'ice';
  /** SDP text, or an ICE candidate as JSON text. */
  readonly data: string;
}

export interface RoomInfo {
  readonly self: PeerId;
  /** The host: the first peer to have joined the room. */
  readonly host: PeerId;
  /** Peers present when joining, excluding `self`. */
  readonly peers: readonly PeerId[];
}

export interface Signalling {
  /** Joins (or creates) `room`. Rejects when the room is unavailable. */
  join: (room: string) => Promise<RoomInfo>;
  /** Delivers `payload` to peer `to`; best effort. */
  relay: (to: PeerId, payload: SignalPayload) => void;
  onSignal: (cb: (from: PeerId, payload: SignalPayload) => void) => Unsubscribe;
  /** A peer joined or left the room. */
  onPresence: (cb: (peer: PeerId, state: 'join' | 'leave') => void) => Unsubscribe;
  /** Peers currently in the room, excluding self. */
  readonly peers: readonly PeerId[];
  close: () => void;
}

// ---------------------------------------------------------------------------------------------
// Tick driver: how a match is fed and when it may advance (solo, and the lockstep drivers)
// ---------------------------------------------------------------------------------------------

/** Where a driver stands: it decides whether the step loop may advance. */
export type DriverStatus =
  /** Stepping is allowed up to `steppable()`. */
  | 'running'
  /** Waiting for a peer's inputs (the next tick is not sealed yet). */
  | 'stalled'
  /** Everyone is paused; `steppable()` does not advance. */
  | 'paused'
  /** Hash checkpoints disagreed; the match is halted. */
  | 'desynced'
  /** The session is over (host left, or the game ended). */
  | 'ended';

/**
 * How the shell feeds a match and decides when it may advance (D-ZWZVLE5U4MRETLI7: `player` is the
 * hero slot). `localDriver` is solo play; wave 10's lockstep driver (src/net) replaces it and nothing
 * upstream changes. Rule R1 (see `Sim.command`): in networked play only `beforeStep` calls
 * `sim.command` for human and system players, in seal order.
 *
 * Step loop contract, once per tick: `if (match.tick < driver.steppable())`, then
 * `driver.beforeStep(match.tick + 1)`, `match.step()`, `driver.afterStep(events)`.
 */
export interface TickDriver {
  /** A human (or system) input from the local shell; the driver decides when it applies. */
  submit: (player: number, cmd: Command) => void;
  /** The highest tick that is safe to step to (the loop steps while `match.tick < steppable()`). */
  steppable: () => number;
  /** Called right before tick `tick` runs; submits that tick's inputs to the sim (R1). */
  beforeStep: (tick: number) => void;
  /** Called with the events the step produced (hash checkpoints, control commands, the end). */
  afterStep: (events: readonly SimEvent[]) => void;
  status: () => DriverStatus;
  /** Pause or resume for everyone (`by` is the asking player); while paused `steppable()` stays at the current tick. */
  setPaused: (on: boolean, by: number) => void;
  /** Releases timers and listeners; called when the match is replaced (restart) and on shell dispose. */
  dispose: () => void;
  /** The desync dump (NDJSON text) for the "download dump" button; undefined when there is none. */
  dump: () => string | undefined;
  /** Subscribes to callouts (who paused, who dropped, ...); returns the unsubscribe. */
  onNotice: (cb: (n: DriverNotice) => void) => () => void;
}

/** Something the driver tells the shell to call out. Slots are hero slots (= players 0-3). */
export type DriverNotice =
  | { readonly kind: 'paused' | 'resumed'; readonly by: number }
  | { readonly kind: 'dropped'; readonly slots: number[] }
  | { readonly kind: 'hostLeft' }
  | { readonly kind: 'desync'; readonly tick: number }
  | { readonly kind: 'calledWave'; readonly by: number };

// ---------------------------------------------------------------------------------------------
// Wire protocol
// ---------------------------------------------------------------------------------------------

/** One sealed input: a command and the player (hero slot, or `SYSTEM_PLAYER`) it is submitted as. */
export interface SealedInput {
  readonly player: number;
  readonly cmd: Command;
}

/**
 * Tick `tick`'s inputs in the order `beforeStep(tick)` submits them: sorted by player, then by the
 * order each player sent them (rule R1). An empty `inputs` is an empty tick, still sealed.
 */
export interface Seal {
  readonly tick: number;
  readonly inputs: readonly SealedInput[];
}

/** Which peer controls which players (hero slots) in a started game. */
export interface SeatAssignment {
  readonly peer: PeerId;
  readonly players: readonly number[];
}

export type WireMsg =
  /** First message on a link. `abi` is `PROTOCOL_VERSION`; `fingerprint` identifies the build. */
  | { readonly t: 'hello'; readonly abi: number; readonly fingerprint: string; readonly name: string }
  /**
   * Host to all: the lobby. `slots[i]` is the peer that holds hero slot i, null when free; `names[i]`
   * is that peer's name (null when free). A joiner also sends one to the host as a pick request: the
   * host reads only the entries equal to the sender and ignores the rest, names included (see lobbystate.ts).
   */
  | {
      readonly t: 'lobby';
      readonly slots: readonly (PeerId | null)[];
      readonly names: readonly (string | null)[];
      readonly mode: Mode;
      readonly seed: number;
    }
  /** Host to a joiner whose `hello` it turned away; the joiner shows why. */
  | { readonly t: 'refuse'; readonly reason: RefuseReason }
  /** Anyone to host, host to all: leave the game and return to a fresh lobby (restart). */
  | { readonly t: 'end' }
  /** Host to all: the game starts. `delay` is the input delay in ticks. */
  | {
      readonly t: 'start';
      readonly spec: GameSpec;
      readonly seats: readonly SeatAssignment[];
      readonly delay: number;
    }
  /** Peer to host: a command for `player`, wanted to apply at `wantTick` (the host may re-tick it later). */
  | { readonly t: 'input'; readonly player: number; readonly cmd: Command; readonly wantTick: number }
  /** Host to all: tick `tick` is sealed. */
  | ({ readonly t: 'seal' } & Seal)
  /** Peer to host: the state hash after `tick`. */
  | { readonly t: 'hash'; readonly tick: number; readonly hash: string }
  /** Host to all: the hashes disagreed at `tick`; everyone halts. */
  | { readonly t: 'desync'; readonly tick: number }
  /** A peer (by its first player) pauses or resumes everyone; the host relays with the same shape. */
  | { readonly t: 'pause'; readonly by: number }
  | { readonly t: 'resume'; readonly by: number }
  /** Host to all: `peer` left; its players are handed to bots at `atTick` (a sealed control command). */
  | { readonly t: 'drop'; readonly peer: PeerId; readonly atTick: number }
  | { readonly t: 'bye' }
  | { readonly t: 'ping'; readonly n: number }
  | { readonly t: 'pong'; readonly n: number };

/** Why the host refused a joiner: protocol version, build, no seat left in the room, or the game is under way. */
export type RefuseReason = 'abi' | 'fingerprint' | 'full' | 'started';

export type WireKind = WireMsg['t'];

/** Longest accepted encoded message, in UTF-16 units (a seal of four players is far smaller). */
export const MAX_MSG_LENGTH = 65_536;
const MAX_ID = 64;
const MAX_NAME = 32;
const MAX_HASH = 128;
const MAX_FINGERPRINT = 128;
const MAX_INPUTS = 256;
const MAX_PEERS = 16;
const LAST_PLAYER = SYSTEM_PLAYER;
const MODES: readonly string[] = ['director', 'schedule'];
const REFUSALS: readonly string[] = ['abi', 'fingerprint', 'full', 'started'];
const POLICIES: readonly string[] = ['human', 'bots', 'off'];
const MAX_DELAY = 60;

export type DecodeResult =
  | { readonly ok: true; readonly msg: WireMsg }
  | { readonly ok: false; readonly reason: string };

/** Message to JSON text. */
export function encodeMsg(msg: WireMsg): string {
  return JSON.stringify(msg);
}

/**
 * Parses and validates one message. Never throws: anything that is not exactly a `WireMsg` is a
 * refusal with a reason. Commands are shape-checked by `isValidCommand` and returned canonical.
 */
export function decodeMsg(text: string): DecodeResult {
  if (typeof text !== 'string' || text.length > MAX_MSG_LENGTH) {
    return refuse('too long or not text');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return refuse('not JSON');
  }
  return validateMsg(raw);
}

/** Validates an already parsed value (what `decodeMsg` does after parsing). */
export function validateMsg(raw: unknown): DecodeResult {
  if (!isRecord(raw) || typeof raw.t !== 'string') {
    return refuse('not a message');
  }
  const msg = build(raw);
  return msg === undefined ? refuse(`bad '${raw.t}' message`) : { ok: true, msg };
}

function refuse(reason: string): DecodeResult {
  return { ok: false, reason };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isTick(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;
}

function isStr(v: unknown, max: number, min = 0): v is string {
  return typeof v === 'string' && v.length >= min && v.length <= max;
}

function isPlayer(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= LAST_PLAYER;
}

function isPeerId(v: unknown): v is PeerId {
  return isStr(v, MAX_ID, 1);
}

function command(v: unknown): Command | undefined {
  if (!isRecord(v) || typeof v.kind !== 'string') {
    return undefined;
  }
  const cmd = v as unknown as Command;
  return isValidCommand(cmd) ? canonicalCommand(cmd) : undefined;
}

function sealedInputs(v: unknown): SealedInput[] | undefined {
  if (!Array.isArray(v) || v.length > MAX_INPUTS) {
    return undefined;
  }
  const out: SealedInput[] = [];
  for (const item of v as unknown[]) {
    const cmd = isRecord(item) ? command(item.cmd) : undefined;
    if (!(isRecord(item) && isPlayer(item.player)) || cmd === undefined) {
      return undefined;
    }
    out.push({ player: item.player, cmd });
  }
  return out;
}

function seats(v: unknown): SeatAssignment[] | undefined {
  if (!Array.isArray(v) || v.length > MAX_PEERS) {
    return undefined;
  }
  const out: SeatAssignment[] = [];
  for (const item of v as unknown[]) {
    if (
      !(isRecord(item) && isPeerId(item.peer) && Array.isArray(item.players)) ||
      item.players.length > LAST_PLAYER + 1 ||
      !(item.players as unknown[]).every(isPlayer)
    ) {
      return undefined;
    }
    out.push({ peer: item.peer, players: [...(item.players as number[])] });
  }
  return out;
}

function slots(v: unknown): (PeerId | null)[] | undefined {
  if (!Array.isArray(v) || v.length !== HERO_SLOTS) {
    return undefined;
  }
  const out: (PeerId | null)[] = [];
  for (const item of v as unknown[]) {
    if (item !== null && !isPeerId(item)) {
      return undefined;
    }
    out.push(item);
  }
  return out;
}

/** Shallow check of the fields every `GameSpec` has; deep validation is the Match's. */
function gameSpec(v: unknown): GameSpec | undefined {
  if (
    !(isRecord(v) && isTick(v.abi) && isTick(v.seed)) ||
    typeof v.mode !== 'string' ||
    !MODES.includes(v.mode) ||
    !Array.isArray(v.doctrines) ||
    v.doctrines.length !== HERO_SLOTS ||
    !(v.doctrines as unknown[]).every((d) => isStr(d, MAX_ID, 1)) ||
    typeof v.reactionSeconds !== 'number' ||
    typeof v.thinkSeconds !== 'number' ||
    !isTick(v.maxTicks) ||
    !isTick(v.hashEvery) ||
    v.hashEvery < 1
  ) {
    return undefined;
  }
  if (v.bargainPolicy !== undefined && !(typeof v.bargainPolicy === 'string' && POLICIES.includes(v.bargainPolicy))) {
    return undefined;
  }
  if (v.humans !== undefined && !(Array.isArray(v.humans) && (v.humans as unknown[]).every(isPlayer))) {
    return undefined;
  }
  return v as unknown as GameSpec;
}

type Raw = Record<string, unknown>;

function buildHello(r: Raw): WireMsg | undefined {
  return isTick(r.abi) && isStr(r.fingerprint, MAX_FINGERPRINT) && isStr(r.name, MAX_NAME)
    ? { t: 'hello', abi: r.abi, fingerprint: r.fingerprint, name: r.name }
    : undefined;
}

function names(v: unknown): (string | null)[] | undefined {
  if (!Array.isArray(v) || v.length > HERO_SLOTS) {
    return undefined;
  }
  return (v as unknown[]).every((n) => n === null || isStr(n, MAX_NAME)) ? [...(v as (string | null)[])] : undefined;
}

function buildLobby(r: Raw): WireMsg | undefined {
  const s = slots(r.slots);
  const n = names(r.names);
  return s !== undefined && n !== undefined && typeof r.mode === 'string' && MODES.includes(r.mode) && isTick(r.seed)
    ? { t: 'lobby', slots: s, names: n, mode: r.mode as Mode, seed: r.seed }
    : undefined;
}

function buildRefuse(r: Raw): WireMsg | undefined {
  return typeof r.reason === 'string' && REFUSALS.includes(r.reason)
    ? { t: 'refuse', reason: r.reason as RefuseReason }
    : undefined;
}

/**
 * Seats and spec must tell one story (L3/L4): every seat holds hero slots 0-3, no peer or slot appears
 * twice, and the seated slots are exactly `spec.humans` (an absent `humans` is none).
 */
function consistent(spec: GameSpec, s: readonly SeatAssignment[]): boolean {
  const humans = spec.humans ?? [];
  const seated = s.flatMap((a) => a.players);
  return (
    new Set(s.map((a) => a.peer)).size === s.length &&
    seated.every((p) => p < HERO_SLOTS) &&
    new Set(seated).size === seated.length &&
    new Set(humans).size === humans.length &&
    humans.every((p) => p < HERO_SLOTS) &&
    seated.length === humans.length &&
    seated.every((p) => humans.includes(p))
  );
}

function buildStart(r: Raw): WireMsg | undefined {
  const spec = gameSpec(r.spec);
  const s = seats(r.seats);
  return spec !== undefined &&
    s !== undefined &&
    consistent(spec, s) &&
    isTick(r.delay) &&
    r.delay >= 1 &&
    r.delay <= MAX_DELAY
    ? { t: 'start', spec, seats: s, delay: r.delay }
    : undefined;
}

/** The command kinds a peer may send as input. Everything else (control, spawn, summon, send) is the host's or a test rig's. */
const PEER_COMMANDS: readonly string[] = [
  'move',
  'stop',
  'hold',
  'ability',
  'autocast',
  'intent',
  'bargain',
  'callWave',
];

/** True when `cmd` is a command a peer may submit through the host (a hero player 0-3 sends it). */
export function isPeerCommand(cmd: Command): boolean {
  return PEER_COMMANDS.includes(cmd.kind);
}

function buildInput(r: Raw): WireMsg | undefined {
  const cmd = command(r.cmd);
  return isPlayer(r.player) && r.player < HERO_SLOTS && cmd !== undefined && isPeerCommand(cmd) && isTick(r.wantTick)
    ? { t: 'input', player: r.player, cmd, wantTick: r.wantTick }
    : undefined;
}

function buildSeal(r: Raw): WireMsg | undefined {
  const inputs = sealedInputs(r.inputs);
  return isTick(r.tick) && inputs !== undefined ? { t: 'seal', tick: r.tick, inputs } : undefined;
}

function buildHash(r: Raw): WireMsg | undefined {
  return isTick(r.tick) && isStr(r.hash, MAX_HASH, 1) ? { t: 'hash', tick: r.tick, hash: r.hash } : undefined;
}

function buildDesync(r: Raw): WireMsg | undefined {
  return isTick(r.tick) ? { t: 'desync', tick: r.tick } : undefined;
}

function buildPause(r: Raw): WireMsg | undefined {
  return isPlayer(r.by) ? { t: r.t === 'pause' ? 'pause' : 'resume', by: r.by } : undefined;
}

function buildDrop(r: Raw): WireMsg | undefined {
  return isPeerId(r.peer) && isTick(r.atTick) ? { t: 'drop', peer: r.peer, atTick: r.atTick } : undefined;
}

function buildPing(r: Raw): WireMsg | undefined {
  return isTick(r.n) ? { t: r.t === 'ping' ? 'ping' : 'pong', n: r.n } : undefined;
}

const BUILDERS: Readonly<Record<WireKind, (r: Raw) => WireMsg | undefined>> = {
  hello: buildHello,
  lobby: buildLobby,
  refuse: buildRefuse,
  end: () => ({ t: 'end' }),
  start: buildStart,
  input: buildInput,
  seal: buildSeal,
  hash: buildHash,
  desync: buildDesync,
  pause: buildPause,
  resume: buildPause,
  drop: buildDrop,
  bye: () => ({ t: 'bye' }),
  ping: buildPing,
  pong: buildPing,
};

function build(raw: Raw): WireMsg | undefined {
  return Object.hasOwn(BUILDERS, raw.t as string) ? BUILDERS[raw.t as WireKind](raw) : undefined;
}
