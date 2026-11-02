// The shell mounts with injected time and frame scheduler and disposes cleanly. Without WebGL2 (or
// while a step-2 module is still a stub) it must show the fallback message instead of crashing.

import { expect, it, vi } from 'vitest';
import { acquireContext } from '../../src/client/gl/context.ts';
import { mountShell } from '../../src/client/shell/app.ts';
import { defaultShellConfig } from '../../src/client/shell/config.ts';

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
      return {
        submit: () => undefined,
        steppable: () => Number.POSITIVE_INFINITY,
        beforeStep: () => undefined,
        afterStep: () => undefined,
        status: () => 'running',
      };
    },
  });
  const first = seen.at(-1);
  shell.dispatch({ kind: 'restart' });
  expect(seen.at(-1)).toBe(shell.match());
  expect(seen.at(-1)).not.toBe(first);
  shell.dispose();
  remove();
});

it('solo: selecting another hero takes it over and hands the previous one back to its bot', () => {
  if (!hasGl2) {
    return;
  }
  const { canvas, hud, remove } = elements();
  const shell = mountShell({ canvas, hud }, defaultShellConfig(), { now: () => 0, schedule: () => () => undefined });
  expect(shell.match().driven).toEqual([0]);
  shell.dispatch({ kind: 'select', slot: 2 });
  expect(shell.match().driven).toEqual([2]);
  expect(shell.controls().selected).toBe(2);
  shell.dispatch({ kind: 'select', slot: 0 });
  expect(shell.match().driven).toEqual([0]);
  shell.dispatch({ kind: 'select', slot: 9 });
  expect(shell.match().driven).toEqual([0]);
  shell.dispatch({ kind: 'restart' });
  expect(shell.match().driven).toEqual([0]);
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
