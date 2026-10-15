// Constant-pixel star sprites and an engraved floor, adapted from prototype A. All pow bases are positive;
// smoothstep edges are ordered. The floor uses derivatives to keep thin lines stable at the capped phone DPR.
export const STAR_VERTEX = `
precision highp float;
attribute vec3 position; attribute vec2 uv; attribute vec2 uv2;
uniform mat4 view; uniform mat4 projection;
uniform float uPixel; uniform float uTime;
varying vec2 vCorner; varying float vBrightness;
void main() {
  vec4 p = view * vec4(position, 1.0);
  p.xy += uv * uv2.x * p.z * uPixel;
  gl_Position = projection * p;
  vCorner = uv;
  vBrightness = uv2.y * (0.78 + 0.22 * sin(uTime * (0.7 + uv2.y * 2.3) + position.x * 0.37));
}`;

export const STAR_FRAGMENT = `
precision highp float;
varying vec2 vCorner; varying float vBrightness;
uniform float uFade;
void main() {
  float d = dot(vCorner, vCorner);
  float glow = exp(-d * 5.5) + 0.25 * exp(-d * 1.4);
  gl_FragColor = vec4(vec3(0.78, 0.88, 1.0) * glow * vBrightness * uFade, 1.0);
}`;

export const FLOOR_VERTEX = `
precision highp float;
attribute vec3 position;
uniform mat4 world; uniform mat4 viewProjection;
varying vec3 vWorld;
void main() {
  vec4 p = world * vec4(position, 1.0);
  vWorld = p.xyz;
  gl_Position = viewProjection * p;
}`;

export const FLOOR_FRAGMENT = `#extension GL_OES_standard_derivatives : enable
precision highp float;
varying vec3 vWorld;
uniform vec3 uCenter; uniform float uFade; uniform float uTime;
float lineAt(float d, float width) {
  float aa = max(fwidth(d) * 1.2, 0.0001);
  return 1.0 - smoothstep(width, width + aa, abs(d));
}
void main() {
  vec2 p = vWorld.xz - uCenter.xz;
  float radius = length(p), angle = atan(p.y, p.x);
  float m = mod(radius, 1.6), m8 = mod(radius + 0.8, 8.0);
  float thin = lineAt(min(m, 1.6 - m), 0.004);
  float bold = lineAt(min(m8, 8.0 - m8), 0.03);
  float edge = lineAt(radius - 12.0, 0.05);
  float segment = 6.2831853 / 32.0;
  float radial = lineAt((mod(angle + segment * 0.5, segment) - segment * 0.5) * radius, 0.006);
  radial *= smoothstep(2.0, 3.0, radius) * (1.0 - step(12.0, radius));
  float sand = 1.0 - smoothstep(11.5, 12.5, radius);
  float pulse = 0.55 + 0.45 * sin(radius * 0.7 - uTime * 1.6);
  float fade = 1.0 - smoothstep(21.0, 30.0, radius);
  float light = (thin * 0.20 + bold * 0.85 * pulse) * sand + edge * 1.4 + radial * 0.22;
  light += exp(-radius * radius / 40.0) * 0.30 * sand;
  vec3 base = mix(vec3(0.006, 0.009, 0.016), vec3(0.010, 0.016, 0.028), sand);
  gl_FragColor = vec4(base + vec3(0.38, 0.65, 0.82) * light * fade, uFade * fade);
}`;
