// Cloudflare Worker: WebSocket signalling rooms, one Durable Object per room.
//   GET /new          -> { room }            a fresh 4-letter code, one that is not in use where cheap
//   GET /ws/{room}    -> WebSocket upgrade   joins the room (protocol in room.ts); the `joined` message
//                                            carries the ICE servers (there is no public `/turn`)
// `ALLOWED_ORIGINS` (comma separated, unset = every origin) limits who may call either path.
// Never deployed by the agent; see worker/README.md.

import {
  createRoom,
  deliverAll,
  isRoomCode,
  joinRoom,
  leaveRoom,
  type Outgoing,
  originAllowed,
  parseClientMsg,
  relaySignal,
  roomCode,
  withIceServers,
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
  /** Comma separated origins allowed to call the worker; unset or empty allows every origin. */
  readonly ALLOWED_ORIGINS?: string;
}

const WS_PATH = /^\/ws\/(?<room>[^/]+)$/u;
/** How many codes `/new` tries before it settles for the last one. */
const NEW_TRIES = 5;

function json(body: unknown, origin: string | null, env: Env, status = 200): Response {
  // With a list the answer is for exactly the caller's origin; without one any origin may read it.
  const restricted = (env.ALLOWED_ORIGINS ?? '').trim() !== '' && env.ALLOWED_ORIGINS?.trim() !== '*';
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': restricted && origin !== null ? origin : '*',
      ...(restricted ? { vary: 'Origin' } : {}),
    },
  });
}

/** Whether nobody is in room `code` (and it is not over); an unreachable room counts as free. */
async function isFree(env: Env, code: string): Promise<boolean> {
  try {
    const res = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request('https://room/state'));
    return ((await res.json()) as { free?: boolean }).free === true;
  } catch {
    return true;
  }
}

/** A code nobody is using: asks up to NEW_TRIES random codes at once and takes the first free one. */
async function freeCode(env: Env): Promise<string> {
  const codes = Array.from({ length: NEW_TRIES }, () => roomCode(Math.random));
  const free = await Promise.all(codes.map((code) => isFree(env, code)));
  return codes[free.indexOf(true)] ?? (codes.at(-1) as string);
}

// biome-ignore lint/style/noDefaultExport: the Workers runtime requires a default export
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const origin = req.headers.get('origin');
    const m = WS_PATH.exec(url.pathname);
    if (url.pathname !== '/new' && m === null) {
      return json({ error: 'not found' }, origin, env, 404);
    }
    if (!originAllowed(env.ALLOWED_ORIGINS, origin)) {
      return json({ error: 'origin not allowed' }, origin, env, 403);
    }
    if (url.pathname === '/new') {
      return json({ room: await freeCode(env) }, origin, env);
    }
    if (m?.groups?.room !== undefined) {
      const room = decodeURIComponent(m.groups.room).toUpperCase();
      if (!isRoomCode(room)) {
        return json({ error: 'bad room code' }, origin, env, 400);
      }
      return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(req);
    }
    return json({ error: 'not found' }, origin, env, 404);
  },
};

/** One room: holds the sockets and runs the pure state machine from room.ts. */
export class Rooms {
  private readonly room = createRoom();
  private readonly sockets = new Map<string, CfSocket>();

  private readonly env: TurnEnv;

  constructor(_state: unknown, env: TurnEnv) {
    this.env = env;
  }

  async fetch(req: Request): Promise<Response> {
    if (new URL(req.url).pathname === '/state') {
      return Response.json({ free: this.room.peers.length === 0 && !this.room.closed });
    }
    if (req.headers.get('upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }
    // Minted before the join, so nothing awaits between joining and registering the socket.
    const iceServers = await mintIceServers(this.env, (u, init) => fetch(u, init));
    const pair = new WebSocketPair();
    const { 1: server, 0: client } = pair;
    server.accept();
    const id = crypto.randomUUID().slice(0, 8);
    const joined = joinRoom(this.room, id);
    if (joined.ok) {
      this.sockets.set(id, server);
      this.deliver(withIceServers(joined.out, iceServers));
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

  /** A socket that throws on send does not stop the rest of the batch (L3). */
  private deliver(out: readonly Outgoing[]): void {
    deliverAll(out, (to, text) => this.sockets.get(to)?.send(text));
  }
}
