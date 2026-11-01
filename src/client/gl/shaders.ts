// GLSL ES 3.00 sources of the one SDF program. Owner: w7-gl.
// STUB from the contracts slice. Contract: `uniform mat3 uView` (= Camera.matrix); per-instance
// attributes in the `INSTANCE_FLOATS` layout of shell/types.ts, instanced (divisor 1); the unit quad
// comes from `gl_VertexID` (triangle strip, 4 vertices); shape ids are `SHAPE`; output is
// premultiplied alpha.

export const VERTEX_SOURCE = '#version 300 es\nvoid main() { gl_Position = vec4(0.0); }\n';

export const FRAGMENT_SOURCE = '#version 300 es\nprecision highp float;\nout vec4 o;\nvoid main() { o = vec4(0.0); }\n';
