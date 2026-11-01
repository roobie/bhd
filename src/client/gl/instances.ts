// InstanceBuffer: a growable packed Float32Array of instances (pure; no GL). Owner: w7-gl.
// Contract in shell/types.ts (`INSTANCE_FLOATS`, `Instance`, `InstanceBuffer`). The contracts slice
// ships a working version so the scene and renderer slices can test against it from day one; the
// gl slice may refine it (keep the exported signature).

import type { Instance, InstanceBuffer } from '../shell/types.ts';
import { INSTANCE_FLOATS } from '../shell/types.ts';

/** An empty buffer with room for `capacity` instances; it doubles when full and keeps its data. */
export function createInstanceBuffer(capacity = 256): InstanceBuffer {
  let floats = new Float32Array(Math.max(1, capacity) * INSTANCE_FLOATS);
  let count = 0;
  return {
    get count(): number {
      return count;
    },
    push(i: Instance): void {
      if ((count + 1) * INSTANCE_FLOATS > floats.length) {
        const grown = new Float32Array(floats.length * 2);
        grown.set(floats);
        floats = grown;
      }
      const o = count * INSTANCE_FLOATS;
      floats[o] = i.x;
      floats[o + 1] = i.y;
      floats[o + 2] = i.hw;
      floats[o + 3] = i.hh;
      floats[o + 4] = i.rot;
      floats[o + 5] = i.shape;
      floats[o + 6] = i.color[0];
      floats[o + 7] = i.color[1];
      floats[o + 8] = i.color[2];
      floats[o + 9] = i.color[3];
      floats[o + 10] = i.p0;
      floats[o + 11] = i.p1;
      count += 1;
    },
    clear(): void {
      count = 0;
    },
    data(): Float32Array {
      return floats.subarray(0, count * INSTANCE_FLOATS);
    },
  };
}
