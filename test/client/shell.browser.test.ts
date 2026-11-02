// The shell mounts with injected time and frame scheduler and disposes cleanly. Without WebGL2 (or
// while a step-2 module is still a stub) it must show the fallback message instead of crashing.

import { expect, it, vi } from 'vitest';
import { acquireContext } from '../../src/client/gl/context.ts';
import { mountShell } from '../../src/client/shell/app.ts';
import { defaultShellConfig } from '../../src/client/shell/config.ts';
import { localDriver } from '../../src/client/shell/driver.ts';
import type {
  DriverNotice,
  DriverStatus,
  ShellHandle,
  ShellOptions,
  TickDriver,
} from '../../src/client/shell/types.ts';
import { INPUT_DELAY_TICKS } from '../../src/client/shell/types.ts';
import type { Match } from '../../src/match/match.ts';
import type { Command } from '../../src/sim/commands.ts';
import { SYSTEM_PLAYER } from '../../src/sim/commands.ts';

function elements(): { canvas: HTMLCanvasElement; hud: HTMLElement; remove: () => void } {
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;width:390px;height:844px';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
  const hud = document.createElement('div');
  root.append(canvas, hud);
  document.body.append(root);
  return { canvas, hud, remove: () => root.remove() };
}

it('mounts, steps with an injected clock, and disposes cleanly', () => {
  const { canvas, hud, remove } = elements();
  let t = 0;
  let pending: ((ms: number) => void) | undefined;
  let cancelled = 0;
  const shell = mountShell({ canvas, hud }, defaultShellConfig(), {
    now: () => t,
    schedule: (frame) => {
      pending = frame;
      return () => {
        cancelled += 1;
        pending = undefined;
      };
    },
  });
  expect(shell.match().tick).toBe(0);
  // Either it renders, or it shows the fallback (no WebGL2 here, or a step-2 module still a stub).
  expect(shell.rendering || (hud.textContent ?? '').includes('WebGL2 unavailable')).toBe(true);
  expect(shell.rendering || hud.querySelector('a')?.getAttribute('href') === 'index.html').toBe(true);
  for (let i = 0; i < 10; i++) {
    t += 1000 / 30;
    pending?.(t);
  }
  expect(!shell.rendering || shell.match().tick > 0).toBe(true);
  shell.dispose();
  expect(pending).toBeUndefined();
  expect(!shell.rendering || cancelled > 0).toBe(true);
  shell.dispose();
  remove();
});

const hasGl2 = acquireContext(document.createElement('canvas')) !== undefined;

function setRootSize(canvas: HTMLCanvasElement, w: number, h: number): void {
  const root = canvas.parentElement as HTMLElement;
  root.style.width = `${w}px`;
  root.style.height = `${h}px`;
}

it('follows its container: the canvas backing store tracks a resize', async () => {
  if (!hasGl2) {
    return;
  }
  const { canvas, hud, remove } = elements();
  const shell = mountShell({ canvas, hud }, defaultShellConfig(), { now: () => 0, schedule: () => () => undefined });
  expect(shell.rendering).toBe(true);
  expect(canvas.style.width).toBe('100%');
  const dpr = globalThis.devicePixelRatio || 1;
  setRootSize(canvas, 300, 500);
  await vi.waitFor(() => {
    expect([canvas.width, canvas.height]).toEqual([Math.round(300 * dpr), Math.round(500 * dpr)]);
  });
  shell.dispose();
  remove();
});

it('asks the driver factory for a driver per match, so a restart rebinds it', () => {
  if (!hasGl2) {
    return;
  }
  const { canvas, hud, remove } = elements();
  const seen: unknown[] = [];
  const shell = mountShell({ canvas, hud }, defaultShellConfig(), {
    now: () => 0,
    schedule: () => () => undefined,
    driver: (match) => {
      seen.push(match);
      return { ...localDriver(match, INPUT_DELAY_TICKS), status: () => 'running' };
    },
  });
  const first = seen.at(-1);
  shell.dispatch({ kind: 'restart' });
  expect(seen.at(-1)).toBe(shell.match());
  expect(seen.at(-1)).not.toBe(first);
  shell.dispose();
  remove();
});

/** A shell on a manual clock: `run(n)` plays n frames of one tick each. */
function manual(options: Partial<ShellOptions> = {}): {
  shell: ShellHandle;
  run: (frames: number) => void;
  hud: HTMLElement;
  remove: () => void;
} {
  const { canvas, hud, remove } = elements();
  let t = 0;
  let pending: ((ms: number) => void) | undefined;
  const shell = mountShell({ canvas, hud }, defaultShellConfig(), {
    now: () => t,
    schedule: (frame) => {
      pending = frame;
      return () => {
        pending = undefined;
      };
    },
    ...options,
  });
  const run = (frames: number): void => {
    for (let i = 0; i < frames; i++) {
      t += 1000 / 30;
      pending?.(t);
    }
  };
  return { shell, run, hud, remove };
}

it('solo: selecting another hero takes it over through control commands, landing a few ticks later', () => {
  if (!hasGl2) {
    return;
  }
  const submitted: { player: number; cmd: Command }[] = [];
  const { shell, run, remove } = manual({
    driver: (m) => {
      const inner = localDriver(m, INPUT_DELAY_TICKS);
      return {
        ...inner,
        submit: (player, cmd) => {
          submitted.push({ player, cmd });
          inner.submit(player, cmd);
        },
      };
    },
  });
  run(2);
  expect(shell.match().driven).toEqual([0]);
  shell.dispatch({ kind: 'select', slot: 2 });
  expect(shell.controls().selected).toBe(2);
  expect(submitted.map((x) => x.player)).toEqual([SYSTEM_PLAYER, SYSTEM_PLAYER]);
  expect(submitted.map((x) => x.cmd)).toEqual([
    { kind: 'control', op: 'drive', slot: 0, by: 'bot' },
    { kind: 'control', op: 'drive', slot: 2, by: 'human' },
  ]);
  expect(shell.match().driven).toEqual([0]);
  run(INPUT_DELAY_TICKS + 2);
  expect(shell.match().driven).toEqual([2]);
  shell.dispatch({ kind: 'select', slot: 9 });
  expect(submitted).toHaveLength(2);
  shell.dispatch({ kind: 'restart' });
  expect(shell.match().driven).toEqual([0]);
  shell.dispose();
  remove();
});

it('the bargain toggle goes through the driver as a control command', () => {
  if (!hasGl2) {
    return;
  }
  const submitted: Command[] = [];
  const { shell, run, remove } = manual({
    driver: (m) => {
      const inner = localDriver(m, INPUT_DELAY_TICKS);
      return {
        ...inner,
        submit: (player, cmd) => {
          submitted.push(cmd);
          inner.submit(player, cmd);
        },
      };
    },
  });
  shell.dispatch({ kind: 'bargainBots', on: true });
  expect(submitted).toEqual([{ kind: 'control', op: 'bargainPolicy', policy: 'bots' }]);
  run(INPUT_DELAY_TICKS + 2);
  expect(shell.match().bargainPolicy).toBe('bots');
  shell.dispose();
  remove();
});

interface Gated extends TickDriver {
  limit: number;
  state: DriverStatus;
  emit: (n: DriverNotice) => void;
  calls: string[];
}

/** A gated driver: steps only up to `limit`, with a settable status and facts. */
function gated(m: Match): Gated {
  const inner = localDriver(m, INPUT_DELAY_TICKS);
  const d: Gated = {
    ...inner,
    limit: 0,
    state: 'running',
    emit: () => undefined,
    calls: [],
    steppable: () => d.limit,
    status: () => d.state,
    setPaused: (on, by) => {
      d.calls.push(`${on ? 'pause' : 'resume'}:${by}`);
      d.state = on ? 'paused' : 'running';
    },
    dump: () => 'DUMP',
    onNotice: (cb) => {
      d.emit = cb;
      return () => undefined;
    },
  };
  return d;
}

it('steps only to the driver limit, catches up when behind, and keeps drawing when stalled', () => {
  if (!hasGl2) {
    return;
  }
  let driver: Gated | undefined;
  const { shell, run, remove } = manual({
    driver: (m) => {
      driver = gated(m);
      return driver;
    },
  });
  run(5);
  expect(shell.match().tick).toBe(0);
  if (driver !== undefined) {
    driver.limit = 3;
  }
  run(10);
  expect(shell.match().tick).toBe(3);
  if (driver !== undefined) {
    driver.limit = 200;
  }
  // Behind by far more than the wall clock allows in one frame: catch-up runs several steps per frame.
  run(1);
  expect(shell.match().tick).toBeGreaterThan(3 + 5);
  if (driver !== undefined) {
    driver.state = 'stalled';
  }
  const at = shell.match().tick;
  run(5);
  expect(shell.match().tick).toBe(at);
  shell.dispose();
  remove();
});

it('pause goes through the driver when it has one, and the stall and desync panels show', async () => {
  if (!hasGl2) {
    return;
  }
  const downloads: string[] = [];
  let driver: Gated | undefined;
  const { shell, run, hud, remove } = manual({
    download: (_name, text) => {
      downloads.push(text);
    },
    driver: (m) => {
      driver = gated(m);
      return driver;
    },
  });
  run(2);
  shell.dispatch({ kind: 'pause' });
  expect(driver?.calls).toEqual(['pause:0']);
  expect(driver?.state).toBe('paused');
  shell.dispatch({ kind: 'pause' });
  expect(driver?.calls).toEqual(['pause:0', 'resume:0']);
  if (driver !== undefined) {
    driver.state = 'stalled';
  }
  run(3);
  await vi.waitFor(() => expect(hud.querySelector('.netpanel.stalled')).not.toBeNull());
  if (driver !== undefined) {
    driver.state = 'desynced';
  }
  run(3);
  await vi.waitFor(() => expect(hud.querySelector('button.dump')).not.toBeNull());
  hud.querySelector<HTMLButtonElement>('button.dump')?.click();
  expect(downloads).toEqual(['DUMP']);
  shell.dispose();
  remove();
});

it('co-op: callouts name who paused, who called a wave and who dropped', async () => {
  if (!hasGl2) {
    return;
  }
  let driver: Gated | undefined;
  const { shell, run, hud, remove } = manual({
    localPlayers: [1],
    humanSlots: [0, 1],
    names: ['Ann', 'Bo'],
    driver: (m) => {
      driver = gated(m);
      return driver;
    },
  });
  run(2);
  driver?.emit({ kind: 'paused', by: 0 });
  driver?.emit({ kind: 'calledWave', by: 0 });
  driver?.emit({ kind: 'dropped', slots: [0] });
  run(2);
  await vi.waitFor(() => {
    const text = hud.querySelector('.netnotes')?.textContent ?? '';
    expect(text).toContain('Ann');
    expect(text).toContain('called');
    expect(text).toContain('dropped');
  });
  // A dropped human's hero is a bot's: its card is selectable again.
  expect(hud.querySelectorAll('button.card:disabled').length).toBe(0);
  shell.dispose();
  remove();
});

it('co-op: another human hero is not selectable, the toggle is hidden and the restart hook is asked', () => {
  if (!hasGl2) {
    return;
  }
  let restarts = 0;
  const { shell, hud, remove } = manual({
    localPlayers: [1],
    humanSlots: [0, 1],
    names: ['Ann', 'Bo'],
    onRestart: () => {
      restarts += 1;
      return true;
    },
  });
  expect(shell.controls().selected).toBe(1);
  shell.dispatch({ kind: 'select', slot: 0 });
  expect(shell.controls().selected).toBe(1);
  shell.dispatch({ kind: 'select', slot: 3 });
  expect(shell.controls().selected).toBe(3);
  shell.dispatch({ kind: 'bargainBots', on: true });
  expect(hud.querySelector('.bpick')).toBeNull();
  const before = shell.match();
  shell.dispatch({ kind: 'restart' });
  expect(restarts).toBe(1);
  expect(shell.match()).toBe(before);
  shell.dispose();
  remove();
});

it('a feedback sink sees every step and is asked for the visual time', () => {
  if (!hasGl2) {
    return;
  }
  const { canvas, hud, remove } = elements();
  let t = 0;
  let pending: ((ms: number) => void) | undefined;
  let stepped = 0;
  let asked = 0;
  const shell = mountShell({ canvas, hud }, defaultShellConfig(), {
    now: () => t,
    schedule: (frame) => {
      pending = frame;
      return () => undefined;
    },
    feedback: {
      onStep: () => {
        stepped += 1;
      },
      visualTime: (nowMs) => {
        asked += 1;
        return nowMs / 2;
      },
    },
  });
  for (let i = 0; i < 5; i++) {
    t += 1000 / 30;
    pending?.(t);
  }
  expect(stepped).toBe(shell.match().tick);
  expect(stepped).toBeGreaterThan(0);
  expect(asked).toBeGreaterThan(0);
  shell.dispose();
  remove();
});
