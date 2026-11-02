import { expect, it } from 'vitest';
import { mountLobby } from '../../../src/client/shell/lobby.ts';
import type { PeerId, WireMsg } from '../../../src/net/types.ts';

function setup(self: PeerId, fingerprint = 'fp') {
  const root = document.createElement('div');
  document.body.append(root);
  const sent: [PeerId, WireMsg][] = [];
  const copies: string[] = [];
  const handle = mountLobby(root, {
    room: 'ABCD',
    self,
    host: 'h',
    name: 'Ada',
    fingerprint,
    send: (p, m) => sent.push([p, m]),
    broadcast: (m) => sent.push(['*', m]),
    linkFor: (r) => `https://x.test/play.html#room=${r}`,
    copy: (t) => {
      copies.push(t);
      return Promise.resolve(true);
    },
  });
  return { root, sent, copies, handle };
}

const click = (root: HTMLElement, sel: string): void => (root.querySelector(sel) as HTMLElement).click();

it('host view: code, slots, copy link, start gated on a seated human', async () => {
  const { root, copies, handle } = setup('h');
  expect(root.textContent).toContain('ABCD');
  expect(root.querySelectorAll('[data-slot]')).toHaveLength(5);
  expect(root.querySelector('[data-slot="wave-master"]')?.textContent).toContain('Coming soon');
  const start = root.querySelector('[data-act="start"]') as HTMLButtonElement;
  expect(start.disabled).toBe(true);
  click(root, '[data-act="copy"]');
  await Promise.resolve();
  expect(copies).toEqual(['https://x.test/play.html#room=ABCD']);
  let started = 0;
  handle.onStart(() => {
    started += 1;
  });
  click(root, '[data-slot="1"] [data-act="pick"]');
  expect((root.querySelector('[data-act="start"]') as HTMLButtonElement).disabled).toBe(false);
  expect(root.querySelector('[data-slot="1"]')?.className).toContain('mine');
  click(root, '[data-act="start"]');
  expect(started).toBe(1);
  handle.dispose();
  expect(root.querySelector('.lobby')).toBeNull();
});

it('joiner view: no start button, a pick is sent to the host', () => {
  const { root, sent, handle } = setup('a');
  expect(root.querySelector('[data-act="start"]')).toBeNull();
  click(root, '[data-slot="2"] [data-act="pick"]');
  expect(sent.at(-1)?.[0]).toBe('h');
  expect(sent.at(-1)?.[1]).toMatchObject({ t: 'lobby', slots: [null, null, 'a', null] });
  handle.dispose();
});

it('shows the mismatch screen', () => {
  const { root, handle } = setup('a');
  handle.receive('h', { t: 'hello', abi: 1, fingerprint: 'other', name: 'H' });
  expect(root.querySelector('[role="alert"]')?.textContent).toContain('Version mismatch');
  expect(root.querySelector('[data-act="pick"]')).toBeNull();
  handle.dispose();
});
