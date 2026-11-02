// Signalling over a WebSocket to the worker (`worker/index.ts`): GET {base}/ws/{room}. The server
// speaks `ServerMsg` / `ClientMsg` from `worker/room.ts`.

import type { ServerMsg } from '../../../worker/room.ts';
import type { PeerId, RoomInfo, SignalEvent, Signalling, SignalPayload, Unsubscribe } from '../types.ts';

/** The slice of the WebSocket API used here, so tests can pass a fake. */
export interface SocketLike {
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  send: (data: string) => void;
  close: () => void;
}

export interface WsOptions {
  /** Socket factory; default `new WebSocket(url)`. */
  readonly open?: (url: string) => SocketLike;
}

const HTTP = /^http/u;
const TRAILING_SLASH = /\/$/u;

function parseServerMsg(data: unknown): ServerMsg {
  try {
    return JSON.parse(String(data)) as ServerMsg;
  } catch {
    return { t: 'error', reason: 'bad server message' };
  }
}

/** `base` is the worker origin, e.g. `wss://bhd-signal.example.workers.dev` (https/http are mapped to wss/ws). */
export function createWsSignalling(base: string, opts: WsOptions = {}): Signalling {
  const open = opts.open ?? ((url: string) => new WebSocket(url) as unknown as SocketLike);
  const signalCbs = new Set<(from: PeerId, p: SignalPayload) => void>();
  const presenceCbs = new Set<(peer: PeerId, state: 'join' | 'leave') => void>();
  let peers: PeerId[] = [];
  let sock: SocketLike | undefined;
  let closed = false;

  const eventCbs = new Set<(e: SignalEvent) => void>();
  const emit = (e: SignalEvent): void => {
    if (!closed) {
      for (const cb of [...eventCbs]) {
        cb(e);
      }
    }
  };

  const handle = (m: ServerMsg): void => {
    switch (m.t) {
      case 'host-left':
        emit({ kind: 'host-left' });
        break;
      case 'error':
        emit({ kind: 'error', detail: m.reason });
        break;
      case 'signal':
        for (const cb of [...signalCbs]) {
          cb(m.from, m.payload);
        }
        break;
      case 'presence':
        peers = m.state === 'join' ? [...peers, m.peer] : peers.filter((p) => p !== m.peer);
        for (const cb of [...presenceCbs]) {
          cb(m.peer, m.state);
        }
        break;
      default:
        break;
    }
  };

  /** Wires one socket: the first `joined` resolves, an early error or close rejects, later ones are events (L4). */
  const wire = (s: SocketLike, resolve: (info: RoomInfo) => void, reject: (e: Error) => void): void => {
    let joined = false;
    const fail = (kind: SignalEvent['kind'], detail: string): void => {
      if (joined) {
        emit({ kind, detail });
      } else {
        reject(new Error(detail));
      }
    };
    s.onmessage = (ev) => {
      const m = parseServerMsg(ev.data);
      if (joined) {
        handle(m);
      } else if (m.t === 'joined') {
        joined = true;
        peers = [...m.peers];
        resolve({
          self: m.self,
          host: m.host,
          peers: m.peers,
          ...(m.iceServers === undefined ? {} : { iceServers: m.iceServers }),
        });
      } else if (m.t === 'error') {
        reject(new Error(m.reason));
      }
    };
    s.onerror = () => fail('error', 'signalling connection failed');
    s.onclose = () => fail('closed', 'signalling closed');
  };

  return {
    get peers() {
      return peers;
    },
    join(room: string): Promise<RoomInfo> {
      if (sock !== undefined) {
        return Promise.reject(new Error('already joined'));
      }
      const url = `${base.replace(HTTP, 'ws').replace(TRAILING_SLASH, '')}/ws/${encodeURIComponent(room)}`;
      const s = open(url);
      sock = s;
      return new Promise<RoomInfo>((resolve, reject) => wire(s, resolve, reject));
    },
    relay(to, payload) {
      if (sock !== undefined && !closed) {
        sock.send(JSON.stringify({ t: 'relay', to, payload }));
      }
    },
    onSignal(cb): Unsubscribe {
      signalCbs.add(cb);
      return () => signalCbs.delete(cb);
    },
    onPresence(cb): Unsubscribe {
      presenceCbs.add(cb);
      return () => presenceCbs.delete(cb);
    },
    onEvent(cb): Unsubscribe {
      eventCbs.add(cb);
      return () => eventCbs.delete(cb);
    },
    close() {
      closed = true;
      signalCbs.clear();
      presenceCbs.clear();
      eventCbs.clear();
      peers = [];
      sock?.close();
    },
  };
}
