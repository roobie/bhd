// The rtc transport's link bookkeeping against a fake RTCPeerConnection (Node): a link that never
// opens, a send queue that grows, and a send that throws. Real WebRTC is rtc.browser.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRtcTransport } from '../../src/net/rtc.ts';
import type { PeerState, Signalling, Transport } from '../../src/net/types.ts';

interface FakeChannel {
  readyState: string;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  sent: string[];
  throwOnSend: boolean;
  send: (text: string) => void;
  close: () => void;
  open: () => void;
}

function fakeChannel(): FakeChannel {
  const c: FakeChannel = {
    readyState: 'connecting',
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    sent: [],
    throwOnSend: false,
    send: (text) => {
      if (c.throwOnSend) {
        throw new Error('InvalidStateError');
      }
      c.sent.push(text);
    },
    close: () => {
      c.readyState = 'closed';
    },
    open: () => {
      c.readyState = 'open';
      c.onopen?.();
    },
  };
  return c;
}

const channels: FakeChannel[] = [];

/** Used with `new`: a constructor that returns an object makes that object the instance. */
function fakePc(): unknown {
  return {
    localDescription: { sdp: 'sdp' },
    connectionState: 'new',
    onicecandidate: null,
    onconnectionstatechange: null,
    ondatachannel: null,
    createDataChannel: () => {
      const c = fakeChannel();
      channels.push(c);
      return c;
    },
    createOffer: () => Promise.resolve({ type: 'offer', sdp: 'sdp' }),
    setLocalDescription: () => Promise.resolve(),
    close: () => undefined,
  };
}

const signalling: Signalling = {
  join: () => Promise.reject(new Error('unused')),
  relay: () => undefined,
  onSignal: () => () => undefined,
  onPresence: () => () => undefined,
  peers: [],
  close: () => undefined,
};

function client(): { t: Transport; events: string[] } {
  const t = createRtcTransport({ self: 'c', host: 'h', signalling });
  const events: string[] = [];
  t.onPeer((peer: string, state: PeerState) => events.push(`${state}:${peer}`));
  return { t, events };
}

describe('rtc link bookkeeping', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    channels.length = 0;
    vi.stubGlobal('RTCPeerConnection', fakePc);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('abandons a link that has not opened in 15 s and reports it down', async () => {
    const { t, events } = client();
    await vi.advanceTimersByTimeAsync(14_000);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(2000);
    expect(events).toEqual(['down:h']);
    t.send('h', { t: 'bye' }); // dropped: no link any more
    expect(channels[0]?.sent).toEqual([]);
  });

  it('does not abandon a link that opened', async () => {
    const { events } = client();
    channels[0]?.open();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(events).toEqual(['up:h']);
  });

  it('caps what is queued for a link that is not open', () => {
    const { t, events } = client();
    for (let i = 0; i < 300; i++) {
      t.send('h', { t: 'ping', n: i });
    }
    expect(events).toEqual(['down:h']);
  });

  it('a throwing send on an open link counts as a drop', () => {
    const { t, events } = client();
    const channel = channels[0] as FakeChannel;
    channel.open();
    channel.throwOnSend = true;
    t.send('h', { t: 'ping', n: 1 });
    expect(events).toEqual(['up:h', 'down:h']);
  });
});
