// Browser test: a log built from a synthetic spec replays in the viewer and verifies; a tampered log
// reports the divergence. Asserts the replay machinery only, never gameplay numbers.

import { expect, test as it, vi } from 'vitest';
import { mount } from '../../src/client/app.ts';
import type { GameSpec } from '../../src/match/run.ts';
import { DEFAULT_HASH_EVERY, RUN_ABI, runGame } from '../../src/match/run.ts';
import type { LogHeader } from '../../src/replay/log.ts';
import { encodeLog } from '../../src/replay/log.ts';
import type { SimEvent } from '../../src/sim/events.ts';

const SPEC: GameSpec = {
  abi: RUN_ABI,
  seed: 5,
  mode: 'director',
  doctrines: ['hold-the-line', 'hold-the-line', 'hold-the-line', 'hold-the-line'],
  reactionSeconds: 0.4,
  thinkSeconds: 0.5,
  maxTicks: 400,
  hashEvery: DEFAULT_HASH_EVERY,
};
const TAMPERED_CHECKPOINT = 4;

function logUrl(tamper: boolean): string {
  const r = runGame(SPEC);
  const header: LogHeader = {
    format: 'bhd-log',
    v: 1,
    abi: RUN_ABI,
    side: 'test',
    ref: 'WORKTREE',
    sha: 'abcdef0123456789',
    dirty: false,
    fingerprint: 'f',
    spec: SPEC,
    resolved: r.resolved,
    end: r.end,
    ticks: r.ticks,
  };
  let seen = 0;
  const events = r.events.map((e): SimEvent => {
    if (tamper && e.kind === 'hash') {
      seen += 1;
      if (seen === TAMPERED_CHECKPOINT) {
        return { ...e, stateHash: 'tampered' };
      }
    }
    return e;
  });
  return URL.createObjectURL(new Blob([encodeLog(header, events)], { type: 'text/plain' }));
}

async function open(tamper: boolean, tick: number): Promise<{ root: HTMLElement; stop: () => void }> {
  globalThis.location.hash = `#log=${logUrl(tamper)}&tick=${tick}`;
  const root = document.createElement('div');
  document.body.append(root);
  const stop = mount(root);
  await vi.waitFor(() => root.querySelector('.replay.ok, .replay.bad') ?? Promise.reject(new Error('no banner')), {
    timeout: 10_000,
  });
  return { root, stop };
}

it('a log replays, pauses 2 s before the tick and verifies', async () => {
  const { root, stop } = await open(false, 300);
  expect(root.querySelector('.replay')?.textContent).toContain('replay verified (log abcdef0');
  const read = () => Number(root.querySelector('#tick')?.textContent);
  await expect.poll(read).toBe(240);
  expect(root.querySelector('.hud')?.textContent).toContain('(paused)');
  // The viewer stays usable: stepping works and verification continues.
  root.querySelectorAll<HTMLButtonElement>('.controls button')[1]?.click();
  await expect.poll(read).toBe(241);
  expect(root.querySelector('.replay')?.classList.contains('ok')).toBe(true);
  stop();
  root.remove();
  globalThis.location.hash = '';
});

it('a log whose hash differs reports the first diverging tick', async () => {
  const { root, stop } = await open(true, 300);
  expect(root.querySelector('.replay.bad')?.textContent).toContain(
    `diverged at tick ${TAMPERED_CHECKPOINT * DEFAULT_HASH_EVERY}`,
  );
  expect(root.querySelector('canvas')).not.toBeNull();
  stop();
  root.remove();
  globalThis.location.hash = '';
});
