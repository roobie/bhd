// Browser smoke test: the debug viewer mounts, draws a canvas and the tick advances.

import { expect, test as it } from 'vitest';
import { mount } from '../../src/client/app.ts';

it('viewer renders a canvas and advances ticks', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const stop = mount(root);
  await expect.poll(() => root.querySelector('canvas') !== null).toBe(true);
  const read = () => Number(root.querySelector('#tick')?.textContent);
  const first = read();
  await expect.poll(read, { timeout: 5000 }).toBeGreaterThan(first);
  const canvas = root.querySelector('canvas') as HTMLCanvasElement;
  expect(canvas.width).toBeGreaterThan(0);
  const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
  expect(data?.some((v) => v !== 0)).toBe(true);
  expect(root.textContent).toContain('not the game client');
  expect(root.querySelector('[aria-label="gunner heat"]')).not.toBeNull();
  stop();
  root.remove();
});

it('viewer mounts controls, overlays toggles, panels and the log', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  const stop = mount(root);
  await expect.poll(() => root.querySelector('.panels') !== null).toBe(true);
  expect(root.querySelector('[aria-label="bot panel"]')).not.toBeNull();
  expect(root.querySelector('[aria-label="director panel"]')).not.toBeNull();
  expect(root.querySelectorAll('[data-overlay]')).toHaveLength(7);
  expect(root.querySelectorAll('[data-doctrine]')).toHaveLength(4);
  expect(root.querySelectorAll('[data-filter]')).toHaveLength(3);
  expect(root.querySelector('ol.log')).not.toBeNull();
  // Toggling an overlay off and on keeps the viewer running.
  const box = root.querySelector<HTMLInputElement>('[data-overlay="intents"]');
  box?.click();
  box?.click();
  const read = () => Number(root.querySelector('#tick')?.textContent);
  const first = read();
  await expect.poll(read, { timeout: 5000 }).toBeGreaterThan(first);
  stop();
  root.remove();
});
