// The WebGL2 instanced SDF renderer. Owner: w7-gl.

import type { Camera, InstanceBuffer, Renderer, Rgba } from '../shell/types.ts';
import { INSTANCE_FLOATS } from '../shell/types.ts';
import { acquireContext, resizeCanvas, watchContext } from './context.ts';
import { FRAGMENT_SOURCE, VERTEX_SOURCE } from './shaders.ts';

const BYTES = 4;
/** Quad margin for the anti-aliasing fringe, in css pixels. */
const PAD_CSS_PX = 1.5;

interface Resources {
  readonly program: WebGLProgram;
  readonly vao: WebGLVertexArrayObject;
  readonly vbo: WebGLBuffer;
  readonly uView: WebGLUniformLocation;
  readonly uPad: WebGLUniformLocation;
  capacityBytes: number;
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | undefined {
  const shader = gl.createShader(type);
  if (!shader) {
    return undefined;
  }
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true) {
    return shader;
  }
  gl.deleteShader(shader);
  return undefined;
}

function build(gl: WebGL2RenderingContext): Resources | undefined {
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX_SOURCE);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT_SOURCE);
  const program = gl.createProgram();
  const vao = gl.createVertexArray();
  const vbo = gl.createBuffer();
  if (!(vs && fs && program && vao && vbo)) {
    return undefined;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (gl.getProgramParameter(program, gl.LINK_STATUS) !== true) {
    return undefined;
  }
  const uView = gl.getUniformLocation(program, 'uView');
  const uPad = gl.getUniformLocation(program, 'uPad');
  if (!(uView && uPad)) {
    return undefined;
  }
  const stride = INSTANCE_FLOATS * BYTES;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  for (let loc = 0; loc < 3; loc += 1) {
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, loc * 4 * BYTES);
    gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);
  return { program, vao, vbo, uView, uPad, capacityBytes: 0 };
}

/**
 * Builds the renderer on `canvas` (contexts via context.ts, program from shaders.ts), or returns
 * undefined when WebGL2 is unavailable. Context loss flips `lost`, notifies `onLoss(true)`, and on
 * restore rebuilds the program and buffers and notifies `onLoss(false)`; it never throws.
 */
export function createRenderer(canvas: HTMLCanvasElement): Renderer | undefined {
  const gl = acquireContext(canvas);
  if (!gl) {
    return undefined;
  }
  let res = build(gl);
  if (!res) {
    return undefined;
  }
  let lost = false;
  let disposed = false;
  let listener: ((lost: boolean) => void) | undefined;

  const unwatch = watchContext(canvas, {
    onLost: () => {
      lost = true;
      res = undefined;
      listener?.(true);
    },
    onRestored: () => {
      res = build(gl);
      if (!res) {
        return; // stays lost: nothing to draw with
      }
      lost = false;
      listener?.(false);
    },
  });

  return {
    get lost(): boolean {
      return lost;
    },
    resize(cssWidth: number, cssHeight: number, dpr: number): void {
      const size = resizeCanvas(canvas, cssWidth, cssHeight, dpr);
      if (!lost) {
        gl.viewport(0, 0, size.width, size.height);
      }
    },
    draw(buffer: InstanceBuffer, camera: Camera, background: Rgba): void {
      const r = res;
      if (lost || disposed || !r || gl.isContextLost()) {
        return;
      }
      gl.viewport(0, 0, canvas.width, canvas.height);
      const [br, bg, bb, ba] = background;
      gl.clearColor(br * ba, bg * ba, bb * ba, ba);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (buffer.count === 0) {
        return;
      }
      const data = buffer.data();
      gl.bindBuffer(gl.ARRAY_BUFFER, r.vbo);
      if (data.byteLength > r.capacityBytes) {
        r.capacityBytes = Math.max(data.byteLength, r.capacityBytes * 2);
        gl.bufferData(gl.ARRAY_BUFFER, r.capacityBytes, gl.DYNAMIC_DRAW);
      }
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
      gl.useProgram(r.program);
      gl.uniformMatrix3fv(r.uView, false, camera.matrix);
      gl.uniform1f(r.uPad, PAD_CSS_PX / Math.max(camera.pxPerUnit, 1e-6));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(r.vao);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, buffer.count);
      gl.bindVertexArray(null);
    },
    onLoss(l: (lost: boolean) => void): void {
      listener = l;
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      unwatch();
      listener = undefined;
      const r = res;
      res = undefined;
      if (r && !gl.isContextLost()) {
        gl.deleteProgram(r.program);
        gl.deleteVertexArray(r.vao);
        gl.deleteBuffer(r.vbo);
      }
      // Free the context now rather than at garbage collection (browsers cap live contexts).
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}
