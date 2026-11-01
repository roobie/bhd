// Browser smoke test: the debug viewer mounts, draws a canvas and the tick advances.

import { expect, test as it } from 'vitest';
import { mount } from '../../src/client/app.ts';

it('viewer renders a canvas and advances ticks', async () => {
  const root = document.createElement('div');
  document.body.append(root);
  mount(root);
  await expect.poll(() => root.querySelector('canvas') !== null).toBe(true);
  const read = () => Number(root.querySelector('#tick')?.textContent);
  const first = read();
  await expect.poll(read, { timeout: 5000 }).toBeGreaterThan(first);
  const canvas = root.querySelector('canvas') as HTMLCanvasElement;
  expect(canvas.width).toBeGreaterThan(0);
  const data = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height).data;
  expect(data?.some((v) => v !== 0)).toBe(true);
  expect(root.textContent).toContain('not the game client');
});
