// Cloudflare Worker: WebSocket signalling rooms (one Durable Object per room) plus `/turn`.
//   GET /new          -> { room }            a fresh 4-letter code
//   GET /ws/{room}    -> WebSocket upgrade   joins the room (protocol in room.ts)
//   GET /turn         -> { iceServers }
// Never deployed by the agent; see worker/README.md.

import {
  createRoom,
  isRoomCode,
  joinRoom,
  leaveRoom,
  type Outgoing,
  parseClientMsg,
  relaySignal,
  roomCode,
} from './room.ts';
import { mintIceServers, type TurnEnv } from './turn.ts';

// Minimal hand-declared Cloudflare runtime types (no @cloudflare/workers-types dependency).
interface CfSocket {
  accept: () => void;
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  addEventListener: (type: 'message' | 'close' | 'error', cb: (ev: { data?: unknown }) => void) => void;
}
declare const WebSocketPair: new () => { 0: CfSocket; 1: CfSocket };
interface DurableObjectStub {
  fetch: (req: Request) => Promise<Response>;
}
interface DurableObjectNamespace {
  idFromName: (name: string) => unknown;
  get: (id: unknown) => DurableObjectStub;
}
interface Env extends TurnEnv {
  readonly ROOMS: DurableObjectNamespace;
}

const WS_PATH = /^\/ws\/(?<room>[^/]+)$/u;
const CORS = { 'access-control-allow-origin': '*' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS },
  });
}

// biome-ignore lint/style/noDefaultExport: the Workers runtime requires a default export
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/new') {
      return json({ room: roomCode(Math.random) });
    }
    if (url.pathname === '/turn') {
      return json({ iceServers: await mintIceServers(env, (u, init) => fetch(u, init)) });
    }
    const m = WS_PATH.exec(url.pathname);
    if (m?.groups?.room !== undefined) {
      const room = decodeURIComponent(m.groups.room).toUpperCase();
      if (!isRoomCode(room)) {
        return json({ error: 'bad room code' }, 400);
      }
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(req);
    }
    return json({ error: 'not found' }, 404);
  },
};

/** One room: holds the sockets and runs the pure state machine from room.ts. */
export class Rooms {
  private readonly room = createRoom();
  private readonly sockets = new Map<string, CfSocket>();

  fetch(req: Request): Response {
    if (req.headers.get('upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const { 1: server, 0: client } = pair;
    server.accept();
    const id = crypto.randomUUID().slice(0, 8);
    const joined = joinRoom(this.room, id);
    if (joined.ok) {
      this.sockets.set(id, server);
      this.deliver(joined.out);
      server.addEventListener('message', (ev) => this.onMessage(id, ev.data));
      const leave = (): void => {
        if (this.sockets.delete(id)) {
          this.deliver(leaveRoom(this.room, id));
        }
      };
      server.addEventListener('close', leave);
      server.addEventListener('error', leave);
    } else {
      server.send(JSON.stringify({ t: 'error', reason: joined.reason }));
      server.close(1008, joined.reason);
    }
    // `webSocket` and status 101 are Workers extensions to ResponseInit.
    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  private onMessage(from: string, data: unknown): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(String(data));
    } catch {
      return;
    }
    const msg = parseClientMsg(parsed);
    if (msg !== undefined) {
      this.deliver(relaySignal(this.room, from, msg.to, msg.payload));
    }
  }

  private deliver(out: readonly Outgoing[]): void {
    for (const o of out) {
      this.sockets.get(o.to)?.send(JSON.stringify(o.msg));
    }
  }
}
