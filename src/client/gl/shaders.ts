// GLSL ES 3.00 sources of the one SDF program. Owner: w7-gl.
// Contract: `uniform mat3 uView` (= Camera.matrix); per-instance attributes in the `INSTANCE_FLOATS`
// layout of shell/types.ts, instanced (divisor 1); the unit quad comes from `gl_VertexID` (triangle
// strip, 4 vertices); shape ids are `SHAPE`; output is premultiplied alpha.
// Attribute packing: aA = (x, y, hw, hh), aB = (rot, shape, r, g), aC = (b, a, p0, p1).
// `uPad` is the quad margin in world units (room for the anti-aliasing fringe).

export const VERTEX_SOURCE = `#version 300 es
precision highp float;
layout(location = 0) in vec4 aA;
layout(location = 1) in vec4 aB;
layout(location = 2) in vec4 aC;
uniform mat3 uView;
uniform float uPad;
out vec2 vLocal;
flat out vec4 vShapeParams;
flat out vec2 vHalf;
flat out vec4 vColor;

void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  int shape = int(aB.y + 0.5);
  float hw = aA.z;
  float hh = aA.w;
  float p0 = aC.z;
  vec2 ext = vec2(hw, hh);
  if (shape == 0 || shape == 1 || shape == 4 || shape == 5) {
    ext = vec2(hw);
  } else if (shape == 3) {
    ext = vec2(hw + p0, p0);
  }
  ext += uPad;
  vec2 local = corner * ext;
  float c = cos(aB.x);
  float s = sin(aB.x);
  vec2 world = aA.xy + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  vec3 clip = uView * vec3(world, 1.0);
  gl_Position = vec4(clip.xy, 0.0, 1.0);
  vLocal = local;
  vShapeParams = vec4(float(shape), p0, aC.w, hw);
  vHalf = vec2(hw, hh);
  vColor = vec4(aB.zw, aC.xy);
}
`;

export const FRAGMENT_SOURCE = `#version 300 es
precision highp float;
in vec2 vLocal;
flat in vec4 vShapeParams;
flat in vec2 vHalf;
flat in vec4 vColor;
out vec4 outColor;

const float PI = 3.14159265358979;

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

float sdTriangle(vec2 p, float hw, float hh) {
  vec2 a = vec2(hw, 0.0);
  vec2 b = vec2(-hw, hh);
  vec2 c = vec2(-hw, -hh);
  float d = min(sdSegment(p, a, b), min(sdSegment(p, b, c), sdSegment(p, c, a)));
  float s1 = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  float s2 = (c.x - b.x) * (p.y - b.y) - (c.y - b.y) * (p.x - b.x);
  float s3 = (a.x - c.x) * (p.y - c.y) - (a.y - c.y) * (p.x - c.x);
  bool inside = (s1 >= 0.0 && s2 >= 0.0 && s3 >= 0.0) || (s1 <= 0.0 && s2 <= 0.0 && s3 <= 0.0);
  return inside ? -d : d;
}

void main() {
  int shape = int(vShapeParams.x + 0.5);
  float p0 = vShapeParams.y;
  float p1 = vShapeParams.z;
  float hw = vHalf.x;
  float hh = vHalf.y;
  vec2 p = vLocal;
  float r = length(p);
  float d = 1.0e6;
  if (shape == 0) {
    d = r - hw;
  } else if (shape == 1) {
    d = abs(r - (hw - p0 * 0.5)) - p0 * 0.5;
  } else if (shape == 2) {
    vec2 q = abs(p) - vec2(hw, hh) + p0;
    d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - p0;
  } else if (shape == 3) {
    d = length(p - vec2(clamp(p.x, -hw, hw), 0.0)) - p0;
  } else if (shape == 4) {
    float a = abs(atan(p.y, p.x));
    d = max(r - hw, (a - p0) * r);
  } else if (shape == 5) {
    float t = mod(-atan(p.y, p.x), 2.0 * PI) / (2.0 * PI);
    float ring = abs(r - (hw - p1 * 0.5)) - p1 * 0.5;
    if (p0 >= 1.0) {
      d = ring;
    } else if (p0 > 0.0) {
      d = max(ring, (t - p0) * 2.0 * PI * r);
    }
  } else if (shape == 6) {
    d = sdTriangle(p, hw, hh);
  }
  float w = max(fwidth(d), 1.0e-6);
  float cover = clamp(0.5 - d / w, 0.0, 1.0);
  float a = vColor.a * cover;
  outColor = vec4(vColor.rgb * a, a);
}
`;
