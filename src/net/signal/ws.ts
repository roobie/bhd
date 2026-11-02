// Signalling over a WebSocket to the worker (`worker/index.ts`): GET {base}/ws/{room}. The server
// speaks `ServerMsg` / `ClientMsg` from `worker/room.ts`.

import type { ServerMsg } from '../../../worker/room.ts';
import type { PeerId, RoomInfo, Signalling, SignalPayload, Unsubscribe } from '../types.ts';

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

  const handle = (m: ServerMsg): void => {
    if (m.t === 'signal') {
      for (const cb of [...signalCbs]) {
        cb(m.from, m.payload);
      }
    } else if (m.t === 'presence') {
      peers = m.state === 'join' ? [...peers, m.peer] : peers.filter((p) => p !== m.peer);
      for (const cb of [...presenceCbs]) {
        cb(m.peer, m.state);
      }
    }
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
      return new Promise<RoomInfo>((resolve, reject) => {
        let joined = false;
        s.onmessage = (ev) => {
          const m = parseServerMsg(ev.data);
          if (joined) {
            handle(m);
          } else if (m.t === 'joined') {
            joined = true;
            peers = [...m.peers];
            resolve({ self: m.self, host: m.host, peers: m.peers });
          } else if (m.t === 'error') {
            reject(new Error(m.reason));
          }
        };
        s.onerror = () => reject(new Error('signalling connection failed'));
        // Rejecting after a resolve is a no-op, so no `joined` check is needed.
        s.onclose = () => reject(new Error('signalling closed'));
      });
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
    close() {
      closed = true;
      signalCbs.clear();
      presenceCbs.clear();
      peers = [];
      sock?.close();
    },
  };
}
