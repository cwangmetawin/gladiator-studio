import { FLOOR_LIGHTING_GLSL } from './arenaLighting';

// Constant-pixel star sprites and a lit sand floor. All pow bases are positive;
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
uniform vec3 uCenter; uniform vec3 uTheme; uniform float uFade; uniform float uTime;
float lineAt(float d, float width) {
  float aa = max(fwidth(d) * 1.2, 0.0001);
  return 1.0 - smoothstep(width, width + aa, abs(d));
}
void main() {
  vec2 p = vWorld.xz - uCenter.xz;
  float radius = length(p), angle = atan(p.y, p.x);
  float m = mod(radius, 1.6), m8 = mod(radius + 0.8, 8.0);
  float thin = lineAt(min(m, 1.6 - m), 0.009);
  float bold = lineAt(min(m8, 8.0 - m8), 0.038);
  float edge = lineAt(radius - 12.0, 0.055);
  float segment = 6.2831853 / 32.0;
  float radial = lineAt((mod(angle + segment * 0.5, segment) - segment * 0.5) * radius, 0.013);
  radial *= smoothstep(2.0, 3.0, radius) * (1.0 - step(12.0, radius));
  float sand = 1.0 - smoothstep(11.5, 12.5, radius);
  float pulse = 0.88 + 0.12 * sin(radius * 0.7 - uTime * 0.6);
  float fade = 1.0 - smoothstep(21.0, 30.0, radius);
  ${FLOOR_LIGHTING_GLSL}
  gl_FragColor = vec4(base + uTheme * light * fade, uFade * fade);
}`;

/** The same arena paths are uploaded once as joined ribbons. The view-space halo stays legible at distance. */
export const OUTLINE_VERTEX = `
precision highp float;
attribute vec3 position; attribute vec3 normal; attribute vec2 uv; attribute vec4 color;
uniform mat4 worldView; uniform mat4 projection; uniform float uPixel;
varying float vAcross; varying vec4 vColor; varying float vDepth;
void main() {
  vec4 p = worldView * vec4(position, 1.0);
  vec2 tangent = (worldView * vec4(normal, 0.0)).xy;
  vec2 side = vec2(-tangent.y, tangent.x) / max(length(tangent), 0.0001);
  float width = max(0.065, abs(p.z) * uPixel * 2.25);
  p.xy += side * uv.x * width;
  gl_Position = projection * p;
  vAcross = uv.x; vColor = color; vDepth = abs(p.z);
}`;

export const OUTLINE_FRAGMENT = `
precision highp float;
varying float vAcross; varying vec4 vColor; varying float vDepth;
uniform float uFade;
void main() {
  float core = exp(-vAcross * vAcross * 36.0);
  float halo = exp(-vAcross * vAcross * 5.5) * 0.32;
  float depth = mix(1.0, 0.32, smoothstep(13.0, 64.0, vDepth));
  vec3 light = mix(vColor.rgb, vec3(0.88, 0.96, 1.0), core * 0.5);
  gl_FragColor = vec4(light * (core * 1.8 + halo) * vColor.a * depth * uFade, 1.0);
}`;
