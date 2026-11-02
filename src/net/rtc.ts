// WebRTC transport (wave 10 slice B): a star of ordered, reliable data channels.
//
// Topology and roles. The host holds one channel per client; a client holds one, to the host.
// Clients are the offerers: a client creates the data channel and sends an offer to the host as soon
// as its transport exists, and the host answers. This way no setup message can reach a peer whose
// transport is not yet listening (the host exists first by construction: it is the first in the room).
//
// Sends before a channel is open are buffered and flushed in order on open; sends to a peer with no
// link (unknown, or already down) are dropped. `onPeer` reports 'up' when the channel opens and 'down'
// once, when it closes, the connection fails or closes, or signalling reports the peer left.
//
// Bounds (M4): a link that has not opened in 15 s is abandoned ('down' fires, its queue is dropped), a
// queue past 256 messages abandons the link, and a send that throws on an open link is a drop too.
// `disconnect(peer)` closes a link a second later, so a final `refuse` still gets out.
//
// Importable in Node: nothing touches `RTCPeerConnection` until a transport is created.

import type {
  IceServer,
  PeerId,
  PeerState,
  Signalling,
  SignalPayload,
  Transport,
  Unsubscribe,
  WireMsg,
} from './types.ts';
import { decodeMsg, encodeMsg } from './types.ts';

export interface RtcOptions {
  readonly self: PeerId;
  readonly host: PeerId;
  readonly signalling: Signalling;
  /** ICE servers; defaults to public STUN. Add TURN entries (with credentials) for hard NATs. */
  readonly iceServers?: readonly IceServer[];
  /** Receives a line for each dropped (malformed) message and link error; off by default. */
  readonly debug?: (line: string) => void;
}

const DEFAULT_ICE_SERVERS: readonly IceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];

const CHANNEL_LABEL = 'bhd';

/** A link that has not opened by then is abandoned (M4): 'down' fires and its queue is dropped. */
const OPEN_TIMEOUT_MS = 15_000;
/** Most messages buffered for a link that is not open yet; one more and the link is abandoned. */
const MAX_QUEUE = 256;
/** How long a refused peer's link stays up after `disconnect`, so the last message (`refuse`) gets out. */
const DISCONNECT_DELAY_MS = 1000;

interface Link {
  readonly peer: PeerId;
  readonly pc: RTCPeerConnection;
  channel: RTCDataChannel | undefined;
  /** Encoded messages waiting for the channel to open. */
  queue: string[];
  /** ICE candidates that arrived before the remote description. */
  pending: string[];
  remoteSet: boolean;
  up: boolean;
  dead: boolean;
  /** The open-timeout timer, cleared once the link opens or dies. */
  timer: ReturnType<typeof setTimeout> | undefined;
}

/** Runs a promise to completion; every async path here handles its own errors. */
function fire(p: Promise<void>): void {
  p.catch(() => undefined);
}

export function createRtcTransport(options: RtcOptions): Transport {
  const { self, host, signalling, debug } = options;
  const isHost = self === host;
  const rtcConfig: RTCConfiguration = {
    iceServers: (options.iceServers ?? DEFAULT_ICE_SERVERS).map((s) => ({
      urls: typeof s.urls === 'string' ? s.urls : [...s.urls],
      ...(s.username === undefined ? {} : { username: s.username }),
      ...(s.credential === undefined ? {} : { credential: s.credential }),
    })),
  };

  const links = new Map<PeerId, Link>();
  const messageCbs = new Set<(from: PeerId, msg: WireMsg) => void>();
  const peerCbs = new Set<(peer: PeerId, state: PeerState) => void>();
  const badCbs = new Set<(from: PeerId, reason: string) => void>();
  const unsubs: Unsubscribe[] = [];
  let closed = false;

  const log = (...args: unknown[]): void => {
    debug?.(`[rtc ${self}] ${args.map(String).join(' ')}`);
  };

  function emitPeer(peer: PeerId, state: PeerState): void {
    for (const cb of [...peerCbs]) {
      if (!closed) {
        cb(peer, state);
      }
    }
  }

  /** Marks a link dead (once), tears it down and reports 'down' if it was up. */
  function kill(link: Link): void {
    if (link.dead) {
      return;
    }
    link.dead = true;
    clearTimeout(link.timer);
    const wasUp = link.up;
    link.up = false;
    link.queue = [];
    if (links.get(link.peer) === link) {
      links.delete(link.peer);
    }
    try {
      link.channel?.close();
      link.pc.close();
    } catch {
      // Already closed.
    }
    if (wasUp) {
      emitPeer(link.peer, 'down');
    }
  }

  /** Abandons a link that never opened (timeout, queue overflow): 'down' fires even though 'up' never did. */
  function abandon(link: Link, why: string): void {
    if (link.dead) {
      return;
    }
    log('abandoned', link.peer, why);
    kill(link);
    emitPeer(link.peer, 'down');
  }

  function wireChannel(link: Link, channel: RTCDataChannel): void {
    link.channel = channel;
    const onOpen = (): void => {
      if (link.dead || closed) {
        return;
      }
      clearTimeout(link.timer);
      link.up = true;
      emitPeer(link.peer, 'up');
      const queued = link.queue;
      link.queue = [];
      for (const text of queued) {
        sendText(link, text);
      }
    };
    channel.onopen = onOpen;
    channel.onclose = () => kill(link);
    channel.onerror = () => log('channel error', link.peer);
    channel.onmessage = (ev: MessageEvent) => receive(link, ev.data);
    if (channel.readyState === 'open') {
      onOpen();
    }
  }

  function receive(link: Link, data: unknown): void {
    if (link.dead || closed) {
      return;
    }
    const res = typeof data === 'string' ? decodeMsg(data) : ({ ok: false, reason: 'not text' } as const);
    if (!res.ok) {
      log('dropped message from', link.peer, res.reason);
      fanOut(badCbs, link.peer, res.reason);
      return;
    }
    fanOut(messageCbs, link.peer, res.msg);
  }

  /** Calls every callback in `cbs` (a snapshot, so they may unsubscribe) unless the transport closed meanwhile. */
  function fanOut<A, B>(cbs: ReadonlySet<(a: A, b: B) => void>, a: A, b: B): void {
    for (const cb of [...cbs]) {
      if (!closed) {
        cb(a, b);
      }
    }
  }

  function sendText(link: Link, text: string): void {
    if (link.dead) {
      return;
    }
    try {
      link.channel?.send(text);
    } catch (e) {
      // A throwing send on an open link means the message is lost: that is a drop, so the link goes down.
      log('send failed', link.peer, e);
      kill(link);
    }
  }

  function newLink(peer: PeerId): Link {
    const pc = new RTCPeerConnection(rtcConfig);
    const link: Link = {
      peer,
      pc,
      channel: undefined,
      queue: [],
      pending: [],
      remoteSet: false,
      up: false,
      dead: false,
      timer: undefined,
    };
    link.timer = setTimeout(() => abandon(link, 'did not open in time'), OPEN_TIMEOUT_MS);
    pc.onicecandidate = (ev) => {
      if (ev.candidate && !link.dead && !closed) {
        signalling.relay(peer, { kind: 'ice', data: JSON.stringify(ev.candidate.toJSON()) });
      }
    };
    pc.onconnectionstatechange = () => {
      log('connection', peer, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        kill(link);
      }
    };
    links.set(peer, link);
    return link;
  }

  async function addIce(link: Link, data: string): Promise<void> {
    try {
      await link.pc.addIceCandidate(JSON.parse(data) as RTCIceCandidateInit);
    } catch (e) {
      log('bad ice candidate', link.peer, e);
    }
  }

  async function flushIce(link: Link): Promise<void> {
    link.remoteSet = true;
    const { pending } = link;
    link.pending = [];
    await Promise.all(pending.map((data) => addIce(link, data)));
  }

  /** Client: opens the channel and offers to the host. */
  async function connectToHost(): Promise<void> {
    const link = newLink(host);
    wireChannel(link, link.pc.createDataChannel(CHANNEL_LABEL, { ordered: true }));
    try {
      await link.pc.setLocalDescription(await link.pc.createOffer());
      const sdp = link.pc.localDescription?.sdp;
      if (sdp !== undefined && !link.dead && !closed) {
        signalling.relay(host, { kind: 'offer', data: sdp });
      }
    } catch (e) {
      log('offer failed', e);
      kill(link);
    }
  }

  /** Host: answers a client's offer, replacing any older link to that client. */
  async function answer(from: PeerId, sdp: string): Promise<void> {
    const old = links.get(from);
    if (old) {
      kill(old);
    }
    const link = newLink(from);
    link.pc.ondatachannel = (ev) => wireChannel(link, ev.channel);
    try {
      await link.pc.setRemoteDescription({ type: 'offer', sdp });
      await flushIce(link);
      await link.pc.setLocalDescription(await link.pc.createAnswer());
      const reply = link.pc.localDescription?.sdp;
      if (reply !== undefined && !link.dead && !closed) {
        signalling.relay(from, { kind: 'answer', data: reply });
      }
    } catch (e) {
      log('answer failed', from, e);
      kill(link);
    }
  }

  /** Client: the host's answer completes the handshake. */
  async function onAnswer(link: Link, sdp: string): Promise<void> {
    try {
      await link.pc.setRemoteDescription({ type: 'answer', sdp });
      await flushIce(link);
    } catch (e) {
      log('bad answer', link.peer, e);
      kill(link);
    }
  }

  async function onLinkSignal(link: Link, payload: SignalPayload): Promise<void> {
    if (payload.kind === 'answer') {
      await (isHost ? undefined : onAnswer(link, payload.data));
    } else if (link.remoteSet) {
      await addIce(link, payload.data);
    } else {
      link.pending.push(payload.data);
    }
  }

  async function onSignal(from: PeerId, payload: SignalPayload): Promise<void> {
    const link = links.get(from);
    if (closed) {
      return;
    }
    if (payload.kind === 'offer') {
      await (isHost ? answer(from, payload.data) : undefined);
    } else if (link && !link.dead) {
      await onLinkSignal(link, payload);
    }
  }

  unsubs.push(
    signalling.onSignal((from, payload) => {
      fire(onSignal(from, payload));
    }),
    signalling.onPresence((peer, state) => {
      if (state === 'leave') {
        const link = links.get(peer);
        if (link) {
          kill(link);
        }
      }
    }),
  );

  if (!isHost) {
    fire(connectToHost());
  }

  function send(peer: PeerId, msg: WireMsg): void {
    const link = links.get(peer);
    if (closed || !link || link.dead) {
      return;
    }
    const text = encodeMsg(msg);
    if (link.up) {
      sendText(link, text);
    } else if (link.queue.length >= MAX_QUEUE) {
      abandon(link, 'send queue full');
    } else {
      link.queue.push(text);
    }
  }

  return {
    self,
    send,
    broadcast: (msg) => {
      for (const peer of [...links.keys()]) {
        send(peer, msg);
      }
    },
    onMessage: (cb) => {
      messageCbs.add(cb);
      return () => messageCbs.delete(cb);
    },
    onPeer: (cb) => {
      peerCbs.add(cb);
      return () => peerCbs.delete(cb);
    },
    onBad: (cb) => {
      badCbs.add(cb);
      return () => badCbs.delete(cb);
    },
    disconnect: (peer) => {
      const link = links.get(peer);
      if (link) {
        setTimeout(() => kill(link), DISCONNECT_DELAY_MS);
      }
    },
    close: () => {
      if (closed) {
        return;
      }
      closed = true;
      for (const u of unsubs) {
        u();
      }
      for (const link of [...links.values()]) {
        link.dead = true;
        clearTimeout(link.timer);
        try {
          link.channel?.close();
          link.pc.close();
        } catch {
          // Already closed.
        }
      }
      links.clear();
      messageCbs.clear();
      peerCbs.clear();
      badCbs.clear();
    },
  };
}
