// A frame scheduler that keeps running in a background tab (wave 10). `requestAnimationFrame` stops
// entirely while a tab is hidden and timers drop to about 1 Hz, which would stall every peer when the
// host's tab is hidden: the host seals ticks from the step loop. A dedicated Worker's timer is not
// throttled, so each frame is requested twice: from rAF (wins while visible) and from the worker
// (wins while hidden); whichever fires first runs the frame and cancels the other.

export interface BackgroundSchedule {
  /** `ShellOptions.schedule`-compatible: runs `frame` once, soon; returns a cancel function. */
  readonly schedule: (frame: (nowMs: number) => void) => () => void;
  /** Stops the worker. */
  readonly dispose: () => void;
}

/** Fallback delay: slower than a 60 Hz frame so rAF wins while visible, faster than a 30 Hz tick pair. */
const FALLBACK_MS = 33;

const WORKER_SOURCE = `self.onmessage = (e) => { const id = e.data; setTimeout(() => self.postMessage(id), ${FALLBACK_MS}); };`;

export function createBackgroundSchedule(): BackgroundSchedule {
  const waiting = new Map<number, () => void>();
  let worker: Worker | undefined;
  let tried = false;
  let seq = 0;

  function ensureWorker(): Worker | undefined {
    if (!tried) {
      tried = true;
      try {
        const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
        worker = new Worker(url);
        URL.revokeObjectURL(url);
        worker.onmessage = (e: MessageEvent<number>) => waiting.get(e.data)?.();
      } catch {
        worker = undefined; // No workers (or blocked): rAF only, as before.
      }
    }
    return worker;
  }

  return {
    schedule(frame) {
      seq += 1;
      const id = seq;
      let done = false;
      const raf = globalThis.requestAnimationFrame((t) => run(t));
      function run(t: number): void {
        if (done) {
          return;
        }
        done = true;
        globalThis.cancelAnimationFrame(raf);
        waiting.delete(id);
        frame(t);
      }
      waiting.set(id, () => run(performance.now()));
      ensureWorker()?.postMessage(id);
      return () => {
        done = true;
        globalThis.cancelAnimationFrame(raf);
        waiting.delete(id);
      };
    },
    dispose() {
      worker?.terminate();
      worker = undefined;
      tried = true;
      waiting.clear();
    },
  };
}
