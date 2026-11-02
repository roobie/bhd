// STUB (wave 10 step 1): WebRTC transport. Slice B replaces the body; the signature is the contract.
// Star links: the host holds one ordered, reliable data channel per client; a client holds one to the host.

import type { PeerId, Signalling, Transport } from './types.ts';

export interface RtcOptions {
  readonly self: PeerId;
  readonly host: PeerId;
  readonly signalling: Signalling;
  /** ICE servers; defaults to public STUN. */
  readonly iceServers?: readonly { readonly urls: string; readonly username?: string; readonly credential?: string }[];
}

export function createRtcTransport(_options: RtcOptions): Transport {
  throw new Error('createRtcTransport: not implemented (wave 10 slice B)');
}
