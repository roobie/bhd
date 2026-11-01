// Browser tests for the WebGL2 renderer. Where a browser lacks WebGL2, the "unavailable" path is
// tested instead: createRenderer returns undefined and never throws.

import { expect, test as it } from 'vitest';
import { acquireContext, resizeCanvas } from '../../src/client/gl/context.ts';
import { createInstanceBuffer } from '../../src/client/gl/instances.ts';
import { createRenderer } from '../../src/client/gl/renderer.ts';
import { FRAGMENT_SOURCE, VERTEX_SOURCE } from '../../src/client/gl/shaders.ts';
import type { Camera, Instance, Rgba } from '../../src/client/shell/types.ts';
import { SHAPE } from '../../src/client/shell/types.ts';

type Px = [number, number, number, number];
const SIZE = 64;
const hasGl2 = acquireContext(document.createElement('canvas')) !== undefined;
const BG: Rgba = [0, 0, 0, 1];

/** World == css pixels, origin bottom-left, y up. */
function camera(): Camera {
  const s = 2 / SIZE;
  return {
    viewport: { width: SIZE, height: SIZE },
    rotated: false,
    pxPerUnit: 1,
    matrix: new Float32Array([s, 0, 0, 0, s, 0, -1, -1, 1]),
    worldToScreen: (p) => p,
    screenToWorld: (p) => p,
  };
}

function inst(shape: Instance['shape'], over: Partial<Instance>): Instance {
  return { x: 32, y: 32, hw: 10, hh: 10, rot: 0, shape, color: [1, 0, 0, 1], p0: 0, p1: 0, ...over };
}

function render(instances: readonly Instance[]) {
  const canvas = document.createElement('canvas');
  document.body.append(canvas);
  const r = createRenderer(canvas);
  if (!r) {
    throw new Error('no renderer');
  }
  r.resize(SIZE, SIZE, 1);
  const buf = createInstanceBuffer(1);
  for (const i of instances) {
    buf.push(i);
  }
  r.draw(buf, camera(), BG);
  const gl = acquireContext(canvas) as WebGL2RenderingContext;
  const px = (x: number, y: number): Px => {
    const out = new Uint8Array(4);
    gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return [out[0] ?? -1, out[1] ?? -1, out[2] ?? -1, out[3] ?? -1];
  };
  return { canvas, r, px };
}

it('createRenderer is undefined without WebGL2, else a renderer', () => {
  const canvas = document.createElement('canvas');
  const r = createRenderer(canvas);
  expect(r !== undefined).toBe(hasGl2);
  r?.dispose();
});

it('without WebGL2 the context is undefined, never a throw', () => {
  const canvas = document.createElement('canvas');
  expect(canvas.getContext('2d')).not.toBeNull(); // a 2d canvas can no longer yield webgl2
  expect(() => createRenderer(canvas)).not.toThrow();
  expect(createRenderer(canvas)).toBeUndefined();
});

it('resizeCanvas applies DPR to the backing store', () => {
  const canvas = document.createElement('canvas');
  expect(resizeCanvas(canvas, 50.4, 40, 2)).toEqual({ width: 101, height: 80 });
  expect(canvas.width).toBe(101);
  expect(canvas.style.width).toBe('50.4px');
});

it('the shaders compile and link', () => {
  if (!hasGl2) {
    return;
  }
  const gl = acquireContext(document.createElement('canvas')) as WebGL2RenderingContext;
  const p = gl.createProgram();
  for (const [type, src] of [
    [gl.VERTEX_SHADER, VERTEX_SOURCE],
    [gl.FRAGMENT_SHADER, FRAGMENT_SOURCE],
  ] as const) {
    const s = gl.createShader(type) as WebGLShader;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    expect(gl.getShaderInfoLog(s) ?? '').toBe('');
    expect(gl.getShaderParameter(s, gl.COMPILE_STATUS)).toBe(true);
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  expect(gl.getProgramParameter(p, gl.LINK_STATUS)).toBe(true);
});

it('draws shapes where their SDFs say', () => {
  if (!hasGl2) {
    return;
  }
  const { px, r } = render([
    inst(SHAPE.circle, { x: 16, y: 48, hw: 8 }),
    inst(SHAPE.ring, { x: 48, y: 48, hw: 10, p0: 3 }),
    inst(SHAPE.box, { x: 16, y: 16, hw: 8, hh: 5 }),
    inst(SHAPE.triangle, { x: 48, y: 16, hw: 10, hh: 6 }),
  ]);
  const red = (p: Px) => p[0] > 200 && p[1] < 5 && p[2] < 5 && p[3] === 255;
  expect(red(px(16, 48))).toBe(true); // circle centre
  expect(red(px(30, 48))).toBe(false); // outside circle
  expect(red(px(48, 48))).toBe(false); // ring hole
  expect(red(px(48 + 9, 48))).toBe(true); // ring band
  expect(red(px(16, 16))).toBe(true); // box
  expect(red(px(16, 16 + 8))).toBe(false); // above box (hh 5)
  expect(red(px(45, 16))).toBe(true); // triangle body
  expect(red(px(40, 16 + 5))).toBe(false); // triangle base corner, outside
  r.dispose();
});

it('draws segment, sector and arc', () => {
  if (!hasGl2) {
    return;
  }
  const { px, r } = render([
    inst(SHAPE.segment, { x: 32, y: 10, hw: 20, p0: 2 }),
    inst(SHAPE.sector, { x: 10, y: 40, hw: 15, p0: 0.5 }),
    inst(SHAPE.arc, { x: 45, y: 45, hw: 12, p0: 0.5, p1: 3 }),
  ]);
  const lit = (p: Px) => p[0] > 200;
  expect(lit(px(32, 10))).toBe(true); // capsule
  expect(lit(px(32, 16))).toBe(false);
  expect(lit(px(20, 40))).toBe(true); // along +x inside the cone
  expect(lit(px(10, 52))).toBe(false); // outside the half angle
  // clockwise from +x: filled fraction 0.5 covers the lower half (y down from centre)
  expect(lit(px(45, 45 - 10))).toBe(true);
  expect(lit(px(45, 45 + 10))).toBe(false);
  r.dispose();
});

it('blends premultiplied and clears to the background', () => {
  if (!hasGl2) {
    return;
  }
  const { px, r } = render([inst(SHAPE.circle, { color: [1, 1, 1, 0.5] })]);
  const c = px(32, 32);
  expect(c[0]).toBeGreaterThan(120);
  expect(c[0]).toBeLessThan(136);
  expect(c[3]).toBe(255);
  r.dispose();
});

it('survives context loss and restore', async () => {
  if (!hasGl2) {
    return;
  }
  const { canvas, r, px } = render([inst(SHAPE.circle, {})]);
  const gl = acquireContext(canvas) as WebGL2RenderingContext;
  const ext = gl.getExtension('WEBGL_lose_context');
  if (!ext) {
    r.dispose();
    return;
  }
  const events: boolean[] = [];
  r.onLoss((l) => events.push(l));
  ext.loseContext();
  await expect.poll(() => r.lost).toBe(true);
  const buf = createInstanceBuffer(1);
  buf.push(inst(SHAPE.circle, {}));
  expect(() => r.draw(buf, camera(), BG)).not.toThrow();
  ext.restoreContext();
  await expect.poll(() => r.lost).toBe(false);
  expect(events).toEqual([true, false]);
  r.draw(buf, camera(), BG);
  expect(px(32, 32)[0]).toBe(255);
  r.dispose();
});
