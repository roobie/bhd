// WebAudio synth stings, no assets. Owner: w8-feedback.
// Safe everywhere: with no AudioContext (node, tests, old browsers) every call is a silent no-op, and
// nothing throws. The context is created on the first pointer or key event (autoplay policy).

type Sting = 'cashin' | 'wombo' | 'backlash' | 'respawn';

export interface Audio {
  /** Registers the first-gesture listeners; idempotent. */
  unlock: () => void;
  play: (sting: Sting) => void;
  dispose: () => void;
}

interface Note {
  readonly freq: number;
  /** Seconds after the sting starts. */
  readonly at: number;
  readonly dur: number;
  readonly type: OscillatorType;
  readonly gain: number;
  /** Frequency the note glides to by its end, when different. */
  readonly to?: number;
}

const STINGS: Readonly<Record<Sting, readonly Note[]>> = {
  cashin: [
    { freq: 660, at: 0, dur: 0.09, type: 'triangle', gain: 0.18 },
    { freq: 990, at: 0.06, dur: 0.16, type: 'triangle', gain: 0.18 },
  ],
  wombo: [
    { freq: 523, at: 0, dur: 0.12, type: 'square', gain: 0.1 },
    { freq: 659, at: 0.07, dur: 0.12, type: 'square', gain: 0.1 },
    { freq: 784, at: 0.14, dur: 0.12, type: 'square', gain: 0.1 },
    { freq: 1047, at: 0.21, dur: 0.35, type: 'triangle', gain: 0.22 },
  ],
  backlash: [{ freq: 220, at: 0, dur: 0.25, type: 'sawtooth', gain: 0.14, to: 55 }],
  respawn: [
    { freq: 330, at: 0, dur: 0.3, type: 'sine', gain: 0.16, to: 660 },
    { freq: 495, at: 0.1, dur: 0.3, type: 'sine', gain: 0.1, to: 990 },
  ],
};

/** Minimum gap between two stings of one kind, in context seconds. */
const MIN_GAP = 0.08;
const GESTURES = ['pointerdown', 'keydown'] as const;

type ContextCtor = new () => AudioContext;

function contextCtor(): ContextCtor | undefined {
  const found: unknown = Reflect.get(globalThis, 'AudioContext');
  return typeof found === 'function' ? (found as ContextCtor) : undefined;
}

function schedule(ctx: AudioContext, notes: readonly Note[]): void {
  const t0 = ctx.currentTime;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const start = t0 + n.at;
    osc.type = n.type;
    osc.frequency.setValueAtTime(n.freq, start);
    if (n.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(n.to, start + n.dur);
    }
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(n.gain, start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + n.dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + n.dur + 0.02);
  }
}

/** An audio player that does nothing until a gesture unlocks it, and nothing at all without WebAudio. */
export function createAudio(): Audio {
  let ctx: AudioContext | undefined;
  let listening = false;
  const lastAt = new Map<Sting, number>();

  const open = (): void => {
    try {
      const Ctor = contextCtor();
      if (ctx === undefined && Ctor !== undefined) {
        ctx = new Ctor();
      }
      ctx?.resume?.().catch(() => undefined);
    } catch {
      ctx = undefined;
    }
  };
  const onGesture = (): void => {
    open();
    off();
  };
  const off = (): void => {
    if (!listening) {
      return;
    }
    listening = false;
    for (const g of GESTURES) {
      globalThis.removeEventListener?.(g, onGesture);
    }
  };

  return {
    unlock() {
      if (listening || ctx !== undefined || contextCtor() === undefined) {
        return;
      }
      if (typeof globalThis.addEventListener !== 'function') {
        return;
      }
      listening = true;
      for (const g of GESTURES) {
        globalThis.addEventListener(g, onGesture);
      }
    },
    play(sting) {
      try {
        if (ctx === undefined || ctx.state !== 'running') {
          return;
        }
        const last = lastAt.get(sting) ?? Number.NEGATIVE_INFINITY;
        if (ctx.currentTime - last < MIN_GAP) {
          return;
        }
        lastAt.set(sting, ctx.currentTime);
        schedule(ctx, STINGS[sting]);
      } catch {
        // Audio is garnish: never let it break a frame.
      }
    },
    dispose() {
      off();
      try {
        ctx?.close?.().catch(() => undefined);
      } catch {
        // ignore
      }
      ctx = undefined;
    },
  };
}
