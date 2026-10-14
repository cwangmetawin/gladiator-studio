import type { BabylonModule, Scene, ShaderMaterial } from './arenaTypes';

// GLSL for the emblem's two glow ribbons and its electric arcs. Pitfalls from the prototype, kept as
// rules here so nobody "simplifies" them back:
//  - pow(x, y) with x < 0 and smoothstep(a, b, x) with a > b are undefined in GLSL; the first version's
//    arcs and halo had black outlines because of it. Every pow base below is clamped to a positive
//    value first and every smoothstep has edge0 < edge1.
//  - These shaders write additive light: the blend constant is Constants.ALPHA_ADD, depth writes are off.

/** Halo (behind the metal, a rim glow) and current (in front of it, the ignition run). */
const RIBBON_VERTEX = `
precision highp float;
attribute vec3 position; attribute vec3 normal; attribute vec2 uv; attribute vec2 uv2;
uniform mat4 worldViewProjection;
uniform vec3 uPointer;
varying vec2 vUv; varying float vFacing; varying float vDelay;
void main(){
  vUv = uv; vDelay = uv2.x;
  vec2 toPointer = uPointer.xy - position.xy;
  float d = length(toPointer);
  float facing = max(dot(normal.xy, toPointer / max(d, 1e-4)), 0.0);
  vFacing = facing * facing / (1.0 + d * d * 0.05);
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

const RIBBON_FRAGMENT = `
precision highp float;
varying vec2 vUv; varying float vFacing; varying float vDelay;
uniform vec3 uColor; uniform float uHalo; uniform float uCurrent; uniform float uProgress;
uniform float uV0; uniform float uTime; uniform float uFacingGain; uniform float uFade; uniform float uWhite;
void main(){
  float v = vUv.y;
  float halo = (v < uV0 ? 1.0 : exp(-(v - uV0) / (1.0 - uV0) * 3.2));
  halo *= (0.30 + uFacingGain * vFacing) * (0.94 + 0.06 * sin(uTime * 23.0 + vUv.x * 40.0));
  float across = 1.0 - abs(v * 2.0 - 1.0);
  float core = across * across * across;
  float local = clamp((uProgress - vDelay * 0.45) / 0.55, -0.2, 1.5);
  float s = vUv.x;
  float dh = (local - s) * 8.0;
  float head = exp(-dh * dh);
  float lit = (1.0 - smoothstep(local - 0.08, local + 0.02, s)) * (1.0 - smoothstep(1.0, 1.4, local));
  float current = (head * 7.0 + lit * 1.4) * core * step(-0.15, local);
  float k = (halo * uHalo + current * uCurrent) * uFade;
  vec3 col = mix(uColor, vec3(1.0), clamp(head * core * 0.8 * uCurrent, 0.0, 1.0));
  // The brightest part of the glow runs to white (ice) rather than to a saturated cyan; uWhite is 0 for the current.
  col = mix(col, vec3(1.0), clamp((k - 0.2) * uWhite, 0.0, 0.75));
  gl_FragColor = vec4(col * k, 1.0);
}`;

const ARC_VERTEX = `
precision highp float;
attribute vec3 position; attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = worldViewProjection * vec4(position, 1.0); }`;

const ARC_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform float uIntensity; uniform vec3 uColor; uniform float uGrow;
void main(){
  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float ac = max(across, 1e-4);
  float core = pow(ac, 2.2);
  float hot = pow(ac, 9.0);
  float taper = smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
  float grow = 1.0 - smoothstep(uGrow - 0.04, uGrow, vUv.x);
  vec3 col = uColor * core + vec3(1.0) * hot * 1.6;
  gl_FragColor = vec4(col * uIntensity * taper * grow, 1.0);
}`;

/** The signature colour: Gladiator's holo blue. */
export const HOLO: readonly [number, number, number] = [0.31, 0.765, 0.969];

function additive(B: BabylonModule, scene: Scene, name: string, vertex: string, fragment: string,
  attributes: string[], uniforms: string[]): ShaderMaterial {
  const material = new B.ShaderMaterial(name, scene, { vertexSource: vertex, fragmentSource: fragment }, {
    attributes, uniforms: ['worldViewProjection', ...uniforms], needAlphaBlending: true,
  });
  material.backFaceCulling = false;
  material.alphaMode = B.Constants.ALPHA_ADD;
  material.disableDepthWrite = true;
  return material;
}

/** v0 is where the ribbon's halo profile starts: the inner share of its width (halo) or 0.5 (current). */
export function createRibbonMaterial(B: BabylonModule, scene: Scene, name: string, v0: number): ShaderMaterial {
  const material = additive(B, scene, name, RIBBON_VERTEX, RIBBON_FRAGMENT, ['position', 'normal', 'uv', 'uv2'],
    ['uPointer', 'uColor', 'uHalo', 'uCurrent', 'uProgress', 'uV0', 'uTime', 'uFacingGain', 'uFade', 'uWhite']);
  material.setColor3('uColor', new B.Color3(...HOLO));
  material.setFloat('uV0', v0);
  material.setFloat('uHalo', 0);
  material.setFloat('uCurrent', 0);
  material.setFloat('uProgress', -1);
  material.setFloat('uFacingGain', 2.4);
  material.setFloat('uTime', 0);
  material.setFloat('uFade', 1);
  material.setFloat('uWhite', 0);
  material.setVector3('uPointer', B.Vector3.Zero());
  return material;
}

export function createArcMaterial(B: BabylonModule, scene: Scene, name: string): ShaderMaterial {
  const material = additive(B, scene, name, ARC_VERTEX, ARC_FRAGMENT, ['position', 'uv'], ['uIntensity', 'uColor', 'uGrow']);
  material.setColor3('uColor', new B.Color3(0.45, 0.8, 1));
  material.setFloat('uIntensity', 0);
  material.setFloat('uGrow', 1);
  return material;
}

const AURA_VERTEX = `
precision highp float;
attribute vec3 position; attribute vec2 uv;
uniform mat4 worldViewProjection;
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = worldViewProjection * vec4(position, 1.0); }`;

/** A soft elliptical glow behind the emblem: the cheap stand-in for bloom (no extra render pass). */
const AURA_FRAGMENT = `
precision highp float;
varying vec2 vUv;
uniform vec3 uColor; uniform float uStrength;
void main(){
  vec2 p = (vUv - 0.5) * 2.0;
  float r2 = dot(p, p);
  float glow = exp(-r2 * 3.4) * 0.65 + exp(-r2 * 1.1) * 0.35;
  gl_FragColor = vec4(uColor * glow * uStrength * (1.0 - smoothstep(0.7, 1.0, r2)), 1.0);
}`;

export function createAuraMaterial(B: BabylonModule, scene: Scene): ShaderMaterial {
  const material = additive(B, scene, 'emblemAura', AURA_VERTEX, AURA_FRAGMENT, ['position', 'uv'], ['uColor', 'uStrength']);
  material.setColor3('uColor', new B.Color3(...HOLO));
  material.setFloat('uStrength', 0);
  return material;
}
