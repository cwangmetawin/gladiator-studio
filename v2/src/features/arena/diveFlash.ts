import { DIVE_SCREENS, smoothstep } from './journeyProgress';
import type { BabylonModule, Scene } from './arenaTypes';

export const HELMET_CROSSING_SCREENS = DIVE_SCREENS * 0.69;

export function crossingFlash(screens: number, phone: boolean, reduced: boolean): number {
  const p = screens / DIVE_SCREENS;
  if (phone || reduced || p <= 0.63 || p >= 0.8) return 0;
  const distance = (screens - HELMET_CROSSING_SCREENS) / (DIVE_SCREENS * 0.05);
  const gaussian = Math.exp(-distance * distance);
  return gaussian * smoothstep(0.63, 0.66, p) * (1 - smoothstep(0.75, 0.8, p));
}

const FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float uFlash;
uniform vec2 uTexel;
void main() {
  vec2 shift = (vUV * 2.0 - 1.0) * uTexel * (10.0 * uFlash);
  vec4 color = texture2D(textureSampler, vUV);
  color.r = texture2D(textureSampler, clamp(vUV + shift, 0.0, 1.0)).r;
  color.b = texture2D(textureSampler, clamp(vUV - shift, 0.0, 1.0)).b;
  color.rgb *= 1.0 + 0.45 * uFlash;
  gl_FragColor = color;
}`;

/**
 * Compile detached, after the shared render loop starts. No pass is even allocated on a phone.
 * The shader is registered by name, as scenePostProcess does, so Babylon converts it for WebGL2: passed as a
 * 'source:' string it kept 'varying' in a #version 300 es fragment and failed to compile. The pass is created
 * only once the arena scene is ready: Scene.isReady waits for every effect on the engine, so a pass that could
 * not compile would otherwise hold the whole scene in 'loading'.
 */
export function createDiveFlash(B: BabylonModule, scene: Scene, phone: boolean) {
  let pass: InstanceType<BabylonModule['PostProcess']> | null = null, attached = false, strength = 0;
  const camera = scene.activeCamera!;
  return {
    update(screens: number, reduced: boolean, home: boolean, opaqueNight: boolean, sceneReady: boolean): number {
      if (!phone && !reduced && !pass && sceneReady) {
        B.Effect.ShadersStore.arenaCrossingFragmentShader = FRAGMENT;
        pass = new B.PostProcess('arenaCrossing', 'arenaCrossing', ['uFlash', 'uTexel'], null,
          1, null, B.Texture.BILINEAR_SAMPLINGMODE, scene.getEngine());
        pass.onApply = effect => {
          effect.setFloat('uFlash', strength);
          effect.setFloat2('uTexel', 1 / Math.max(1, scene.getEngine().getRenderWidth()), 1 / Math.max(1, scene.getEngine().getRenderHeight()));
        };
      }
      strength = home && opaqueNight ? crossingFlash(screens, phone, reduced) : 0;
      const active = strength > 0.001 && pass?.isReady();
      if (pass && active && !attached) { camera.attachPostProcess(pass); attached = true; }
      if (pass && !active && attached) { camera.detachPostProcess(pass); attached = false; }
      return strength;
    },
    dispose(): void {
      if (attached && pass) camera.detachPostProcess(pass);
      pass?.dispose(); pass = null; attached = false;
    },
  };
}
