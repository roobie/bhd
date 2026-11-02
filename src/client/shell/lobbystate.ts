// Lobby state machine (wave 10 slice E1). Pure: no DOM, no clocks, no sockets; it consumes WireMsgs
// (`hello`, `lobby`, `start`) and local actions and emits WireMsgs through the injected `send` and
// `broadcast`. The host is authoritative over the `lobby` message.
//
// Slot picking reuses the `lobby` message (decided at integration, H2: no separate `pick`): a joiner
// sends a `lobby` to the host as a REQUEST. The host reads only the slots equal to the sender's id
// (the first one is the claim; none is a release) and ignores everything else (names, mode, seed,
// other slots). It then broadcasts the authoritative `lobby`, which also reverts a losing claim on
// the joiner. First come wins. A refused joiner (build, protocol, full room, game started) gets a
// `refuse {reason}` and shows why. `names[i]` names the holder of slot i, so every peer sees them all.

import type { GameSpec, Mode } from '../../match/run.ts';
import type { PeerId, RefuseReason, SeatAssignment, WireMsg } from '../../net/types.ts';
import { PROTOCOL_VERSION } from '../../net/types.ts';
import { shellSpec } from './config.ts';

/** Input delay, in ticks, carried by `start`. */
export const START_DELAY = 3;
export const HERO_SLOTS = 4;

type Start = Extract<WireMsg, { t: 'start' }>;

type LobbyPhase = 'lobby' | 'error' | 'started';

interface LobbyError {
  readonly kind: 'mismatch' | 'refused' | 'host-lost';
  readonly message: string;
}

export interface LobbyView {
  readonly phase: LobbyPhase;
  readonly isHost: boolean;
  readonly self: PeerId;
  readonly host: PeerId;
  readonly slots: readonly (PeerId | null)[];
  readonly mode: Mode;
  readonly seed: number;
  /** Names known to this peer (self, the host, and on the host every accepted peer). */
  readonly names: ReadonlyMap<PeerId, string>;
  /** The hero slot this peer holds. */
  readonly mySlot: number | undefined;
  /** Host only: some human is seated. */
  readonly canStart: boolean;
  readonly error: LobbyError | undefined;
  /** Host only: joiners refused for a version or build mismatch. */
  readonly rejected: number;
}

export interface LobbyDeps {
  readonly self: PeerId;
  readonly host: PeerId;
  readonly name: string;
  /** Identifies the build; peers with another value (or another protocol version) are refused. */
  readonly fingerprint: string;
  readonly send: (peer: PeerId, msg: WireMsg) => void;
  readonly broadcast: (msg: WireMsg) => void;
  readonly mode?: Mode;
  readonly seed?: number;
}

export interface Lobby {
  view: () => LobbyView;
  /** Feed every WireMsg delivered by the transport. */
  receive: (from: PeerId, msg: WireMsg) => void;
  /** A link came up (sends our hello where one is due) or went down. */
  peerUp: (peer: PeerId) => void;
  peerDown: (peer: PeerId) => void;
  /** Take hero slot `slot` (releasing the one held); a no-op when it is taken. */
  pick: (slot: number) => void;
  release: () => void;
  /** Host only. */
  setMode: (mode: Mode) => void;
  setSeed: (seed: number) => void;
  /** Host only; false when refused (not host, nobody seated, already started). */
  start: () => boolean;
  /** Fires after every state change. */
  onChange: (cb: () => void) => () => void;
  /** Fires once with the `start` message, on the host when it starts and on joiners when it arrives. */
  onStart: (cb: (start: Start) => void) => () => void;
}

const REFUSAL_TEXT: Readonly<Record<RefuseReason, string>> = {
  abi: 'The host runs another protocol version. Everyone must load the same build.',
  fingerprint: 'The host runs a different build of the game. Everyone must reload to the same version.',
  full: 'The room is full.',
  started: 'The game has already started. Ask the host to restart to the lobby.',
};

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** A 4-letter room code from an injected uniform [0,1) source. */
export function makeRoomCode(rand: () => number): string {
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += ROOM_ALPHABET.charAt(Math.min(ROOM_ALPHABET.length - 1, Math.floor(rand() * ROOM_ALPHABET.length)));
  }
  return code;
}

export function createLobby(deps: LobbyDeps): Lobby {
  const isHost = deps.self === deps.host;
  const names = new Map<PeerId, string>([[deps.self, deps.name]]);
  const accepted = new Set<PeerId>();
  const rejected = new Set<PeerId>();
  const changeCbs = new Set<() => void>();
  const startCbs = new Set<(s: Start) => void>();
  let slots: (PeerId | null)[] = Array.from({ length: HERO_SLOTS }, () => null);
  let mode: Mode = deps.mode ?? 'director';
  let seed = deps.seed ?? 1;
  let phase: LobbyPhase = 'lobby';
  let error: LobbyError | undefined;

  const hello = (): WireMsg => ({ t: 'hello', abi: PROTOCOL_VERSION, fingerprint: deps.fingerprint, name: deps.name });
  const lobbyMsg = (): WireMsg => ({
    t: 'lobby',
    slots: [...slots],
    names: slots.map((p) => (p === null ? null : (names.get(p) ?? null))),
    mode,
    seed,
  });
  const changed = (): void => {
    for (const cb of [...changeCbs]) {
      cb();
    }
  };
  const mySlot = (): number | undefined => {
    const i = slots.indexOf(deps.self);
    return i < 0 ? undefined : i;
  };
  const seated = (): number => slots.filter((s) => s !== null).length;
  const live = (): boolean => phase === 'lobby';

  function fail(kind: LobbyError['kind'], message: string): void {
    phase = 'error';
    error = { kind, message };
    changed();
  }

  /** Why a hello is unacceptable, or undefined. */
  function mismatch(msg: Extract<WireMsg, { t: 'hello' }>): string | undefined {
    if (msg.abi !== PROTOCOL_VERSION) {
      return `Protocol version ${msg.abi} differs from ours (${PROTOCOL_VERSION}). Everyone must load the same build.`;
    }
    if (msg.fingerprint !== deps.fingerprint) {
      return 'The other player runs a different build of the game. Everyone must reload to the same version.';
    }
    return undefined;
  }

  function refusal(msg: Extract<WireMsg, { t: 'hello' }>): RefuseReason | undefined {
    if (msg.abi !== PROTOCOL_VERSION) {
      return 'abi';
    }
    if (msg.fingerprint !== deps.fingerprint) {
      return 'fingerprint';
    }
    return undefined;
  }

  function onHello(from: PeerId, msg: Extract<WireMsg, { t: 'hello' }>): void {
    if (isHost) {
      hostOnHello(from, msg);
    } else if (from === deps.host) {
      const bad = mismatch(msg);
      if (bad !== undefined) {
        fail('mismatch', bad);
        return;
      }
      names.set(from, msg.name);
      changed();
    }
  }

  function hostOnHello(from: PeerId, msg: Extract<WireMsg, { t: 'hello' }>): void {
    const build = refusal(msg);
    if (build !== undefined) {
      rejected.add(from);
      deps.send(from, { t: 'refuse', reason: build });
      changed();
      return;
    }
    if (!live() || (!accepted.has(from) && accepted.size >= HERO_SLOTS - 1)) {
      deps.send(from, { t: 'refuse', reason: live() ? 'full' : 'started' });
      return;
    }
    accepted.add(from);
    names.set(from, msg.name);
    deps.send(from, lobbyMsg());
    changed();
  }

  /** Host: a joiner's request. Only its own entries count. */
  function onRequest(from: PeerId, msg: Extract<WireMsg, { t: 'lobby' }>): void {
    if (!accepted.has(from)) {
      return;
    }
    const want = msg.slots.indexOf(from);
    const have = slots.indexOf(from);
    if (want === have) {
      return;
    }
    if (want >= 0 && slots[want] !== null) {
      deps.send(from, lobbyMsg()); // lost the race: tell it the truth
      return;
    }
    if (have >= 0) {
      slots[have] = null;
    }
    if (want >= 0) {
      slots[want] = from;
    }
    deps.broadcast(lobbyMsg());
    changed();
  }

  function onLobby(from: PeerId, msg: Extract<WireMsg, { t: 'lobby' }>): void {
    if (isHost) {
      onRequest(from, msg);
    } else if (from === deps.host) {
      slots = [...msg.slots];
      ({ mode, seed } = msg);
      for (const peer of [...names.keys()]) {
        if (peer !== deps.self && peer !== deps.host) {
          names.delete(peer);
        }
      }
      msg.slots.forEach((peer, i) => {
        const name = msg.names[i];
        if (peer !== null && name !== undefined && name !== null && peer !== deps.self && peer !== deps.host) {
          names.set(peer, name);
        }
      });
      changed();
    }
  }

  function onRefuse(from: PeerId, reason: RefuseReason): void {
    if (isHost || from !== deps.host) {
      return;
    }
    fail('refused', REFUSAL_TEXT[reason]);
  }

  function onStartMsg(from: PeerId, msg: Start): void {
    if (isHost || from !== deps.host || !live()) {
      return;
    }
    phase = 'started';
    changed();
    for (const cb of [...startCbs]) {
      cb(msg);
    }
  }

  function seats(): SeatAssignment[] {
    const byPeer = new Map<PeerId, number[]>();
    slots.forEach((peer, i) => {
      if (peer !== null) {
        byPeer.set(peer, [...(byPeer.get(peer) ?? []), i]);
      }
    });
    return [...byPeer].map(([peer, players]) => ({ peer, players }));
  }

  function claim(slot: number): void {
    if (!(live() && Number.isInteger(slot)) || slot < 0 || slot >= HERO_SLOTS) {
      return;
    }
    if (slots[slot] !== null && slots[slot] !== deps.self) {
      return;
    }
    // A joiner is optimistic locally; the host's next `lobby` is the truth.
    slots = slots.map((p, i) => {
      if (i === slot) {
        return deps.self;
      }
      return p === deps.self ? null : p;
    });
    if (isHost) {
      deps.broadcast(lobbyMsg());
    } else {
      deps.send(deps.host, lobbyMsg());
    }
    changed();
  }

  return {
    view: () => ({
      phase,
      isHost,
      self: deps.self,
      host: deps.host,
      slots: [...slots],
      mode,
      seed,
      names: new Map(names),
      mySlot: mySlot(),
      canStart: isHost && live() && seated() > 0,
      error,
      rejected: rejected.size,
    }),
    receive(from, msg) {
      if (phase === 'error') {
        return;
      }
      if (msg.t === 'hello') {
        onHello(from, msg);
      } else if (msg.t === 'lobby') {
        onLobby(from, msg);
      } else if (msg.t === 'refuse') {
        onRefuse(from, msg.reason);
      } else if (msg.t === 'start') {
        onStartMsg(from, msg);
      }
    },
    peerUp(peer) {
      if (isHost || peer === deps.host) {
        deps.send(peer, hello());
      }
    },
    peerDown(peer) {
      if (isHost) {
        accepted.delete(peer);
        rejected.delete(peer);
        names.delete(peer);
        if (slots.includes(peer)) {
          slots = slots.map((p) => (p === peer ? null : p));
          deps.broadcast(lobbyMsg());
        }
        changed();
      } else if (peer === deps.host && live()) {
        fail('host-lost', 'The host left the room.');
      }
    },
    pick: claim,
    release() {
      if (!live() || mySlot() === undefined) {
        return;
      }
      slots = slots.map((p) => (p === deps.self ? null : p));
      if (isHost) {
        deps.broadcast(lobbyMsg());
      } else {
        deps.send(deps.host, lobbyMsg());
      }
      changed();
    },
    setMode(m) {
      if (isHost && live() && m !== mode) {
        mode = m;
        deps.broadcast(lobbyMsg());
        changed();
      }
    },
    setSeed(s) {
      if (isHost && live() && Number.isSafeInteger(s) && s >= 0 && s <= 4_294_967_295 && s !== seed) {
        seed = s;
        deps.broadcast(lobbyMsg());
        changed();
      }
    },
    start() {
      if (!(isHost && live()) || seated() === 0) {
        return false;
      }
      const humans = slots.flatMap((p, i) => (p === null ? [] : [i]));
      const spec: GameSpec = { ...shellSpec({ seed, mode, drive: humans }), networked: true };
      const msg: Start = { t: 'start', spec, seats: seats(), delay: START_DELAY };
      phase = 'started';
      for (const peer of accepted) {
        deps.send(peer, msg);
      }
      changed();
      for (const cb of [...startCbs]) {
        cb(msg);
      }
      return true;
    },
    onChange(cb) {
      changeCbs.add(cb);
      return () => changeCbs.delete(cb);
    },
    onStart(cb) {
      startCbs.add(cb);
      return () => startCbs.delete(cb);
    },
  };
}
