// `/turn`: ICE servers for WebRTC. Public STUN always; Cloudflare TURN credentials when the worker
// has the `TURN_KEY_ID` and `TURN_KEY_TOKEN` secrets.

export interface IceServer {
  readonly urls: string | readonly string[];
  readonly username?: string;
  readonly credential?: string;
}

export interface TurnEnv {
  readonly TURN_KEY_ID?: string;
  readonly TURN_KEY_TOKEN?: string;
}

export const STUN_ONLY: readonly IceServer[] = [{ urls: 'stun:stun.cloudflare.com:3478' }];

const TTL_SECONDS = 3600;

type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

/** `{ iceServers }`: Cloudflare TURN when configured and reachable, otherwise STUN only. */
export async function mintIceServers(env: TurnEnv, doFetch: FetchLike): Promise<readonly IceServer[]> {
  const id = env.TURN_KEY_ID;
  const token = env.TURN_KEY_TOKEN;
  if (!(id && token)) {
    return STUN_ONLY;
  }
  try {
    const res = await doFetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(id)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      },
    );
    if (!res.ok) {
      return STUN_ONLY;
    }
    const body = (await res.json()) as { iceServers?: unknown };
    const list = body.iceServers;
    if (Array.isArray(list) && list.length > 0) {
      return list as IceServer[];
    }
  } catch {
    // Fall through: STUN only keeps the game playable on friendly networks.
  }
  return STUN_ONLY;
}
