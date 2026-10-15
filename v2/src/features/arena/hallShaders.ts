// Prototype B's square slabs, bevel, mip-biased side art and recoloured nebula.
// Register by name: raw `source:` strings bypass Babylon's WebGL2 conversion.
export const CARD_VERTEX = `
precision highp float;
attribute vec3 position; attribute vec3 normal;
uniform mat4 world; uniform mat4 viewProjection; uniform vec2 uSize;
varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldNormal; varying vec3 vPosition;
void main() {
  vec4 p = world * vec4(position, 1.0);
  vPosition = p.xyz; vNormal = normal;
  vWorldNormal = normalize((world * vec4(normal, 0.0)).xyz);
  vUv = vec2(position.x / uSize.x + 0.5, position.y / uSize.y + 0.5);
  gl_Position = viewProjection * p;
}`;

export const CARD_FRAGMENT = `
precision highp float;
varying vec2 vUv; varying vec3 vNormal; varying vec3 vWorldNormal; varying vec3 vPosition;
uniform sampler2D uCover;
uniform vec3 cameraPosition; uniform vec3 uTheme; uniform vec3 uSecondary;
uniform vec2 uSize;
uniform float uBright; uniform float uBlur; uniform float uAlpha; uniform float uReflect; uniform float uTime;
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  vec2 uv = clamp(vUv, 0.0, 1.0);
  vec3 colour;
  float alpha = uAlpha;
  if (vNormal.z < -0.5 || uReflect > 0.5) {
    vec3 art = texture2D(uCover, uv, uBlur).rgb;
    vec3 ambient = vec3(luma(art)) * (uTheme * 1.35 + 0.08);
    colour = mix(art, ambient, (1.0 - uBright) * 0.62) * mix(0.13, 1.0, uBright);
    vec2 edge = min(uv, 1.0 - uv) * uSize;
    float bevel = 1.0 - smoothstep(0.0, 0.012, min(edge.x, edge.y));
    float key = 0.4 + 0.6 * (uv.y * 0.6 + (1.0 - uv.x) * 0.4);
    colour = mix(colour, mix(uSecondary, vec3(1.0), 0.6) * key, bevel * 0.6);
    if (uReflect > 0.5) {
      float fade = 1.0 - smoothstep(0.0, 0.23, uv.y);
      alpha *= fade * fade * smoothstep(0.0, 0.14, uv.x) * (1.0 - smoothstep(0.86, 1.0, uv.x)) * 0.14;
    }
  } else if (vNormal.z > 0.5) {
    colour = vec3(0.013, 0.018, 0.025) + uTheme * 0.04;
  } else {
    vec3 view = normalize(cameraPosition - vPosition);
    float ndv = clamp(abs(dot(normalize(vWorldNormal), view)), 0.0, 1.0);
    float fresnel = pow(max(0.0, 1.0 - ndv), 3.0);
    float glint = 0.5 + 0.5 * sin(vPosition.y * 2.4 + vPosition.x * 1.7 + uTime * 0.7);
    colour = mix(vec3(0.45, 0.5, 0.56), uSecondary, 0.28) * (0.35 + 0.65 * ndv);
    colour += vec3(1.0) * fresnel * 0.25 + uSecondary * glint * 0.1;
  }
  gl_FragColor = vec4(colour, alpha);
}`;

export const SKY_VERTEX = `
precision highp float;
attribute vec3 position; attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUv;
void main() { vUv = uv; gl_Position = worldViewProjection * vec4(position, 1.0); }
`;

// The diffuse glow is in the backdrop shader. No occlusion pass or volumetric post-process:
// this keeps phones at zero post-processes and the desktop dive at its existing single pass.
export const SKY_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uNebula;
uniform vec3 uTheme; uniform vec3 uSecondary;
uniform float uAspect; uniform float uTime; uniform float uFade;
void main() {
  vec2 uv = vUv;
  vec2 drift = vec2(sin(uTime * 0.018), cos(uTime * 0.014)) * 0.008;
  vec3 nebula = texture2D(uNebula, uv + drift).rgb;
  float light = dot(nebula, vec3(0.2126, 0.7152, 0.0722));
  float warmth = clamp((nebula.r - nebula.b) * 3.0 + 0.35, 0.0, 1.0);
  vec3 colour = mix(uTheme, uSecondary, warmth) * light * 0.65;
  vec2 p = (uv - vec2(0.5, 0.59)) * vec2(uAspect, 1.0);
  float glow = exp(-dot(p, p) * 10.0);
  float haze = texture2D(uNebula, uv * 1.3 - drift).g;
  colour += uTheme * glow * (0.12 + haze * 0.55);
  float floorDelta = (uv.y - 0.30) * 11.0;
  colour += uSecondary * exp(-floorDelta * floorDelta) * exp(-p.x * p.x * 1.6) * 0.09;
  colour *= 1.0 - smoothstep(0.25, 0.85, length(p * vec2(0.5, 1.0)));
  gl_FragColor = vec4(colour, uFade * 0.88);
}`;
