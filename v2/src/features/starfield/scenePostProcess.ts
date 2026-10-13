import { SCENE_ENERGY_CALM } from './sceneEnergy';

type BabylonModule = typeof import('@/shared/babylon/babylonCore');
type Scene = InstanceType<BabylonModule['Scene']>;
type Camera = NonNullable<Scene['activeCamera']>;

export function shouldCreateScenePostProcess(phone: boolean, reducedMotion: boolean, fxEnabled: boolean): boolean {
  return !phone && !reducedMotion && fxEnabled;
}

const FRAGMENT = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float sceneEnergy;
uniform vec2 sceneTexel;
void main(void) {
  float lift = clamp((sceneEnergy - ${SCENE_ENERGY_CALM}) / ${1 - SCENE_ENERGY_CALM}, 0.0, 1.0);
  vec2 p = vUV * 2.0 - 1.0;
  float edge = smoothstep(0.25, 1.4, dot(p, p));
  vec2 shift = p * sceneTexel * (0.65 * lift * edge);
  vec4 color = texture2D(textureSampler, vUV);
  color.r = texture2D(textureSampler, clamp(vUV + shift, 0.0, 1.0)).r;
  color.b = texture2D(textureSampler, clamp(vUV - shift, 0.0, 1.0)).b;
  color.rgb *= 1.0 - 0.07 * lift * edge;
  gl_FragColor = color;
}`;

/** One colour pass, at ratio 1 of M1's capped scene resolution. */
export function createScenePostProcess(B: BabylonModule, scene: Scene, camera: Camera, enabled: boolean) {
  let pass: InstanceType<BabylonModule['PostProcess']> | null = null;
  let attached = false;
  let materialEnergy = SCENE_ENERGY_CALM;

  function sync(phone: boolean, reducedMotion: boolean, running: boolean, energy: number): void {
    materialEnergy = energy;
    const eligible = shouldCreateScenePostProcess(phone, reducedMotion, enabled);
    if (!pass && eligible && running) {
      B.Effect.ShadersStore.sceneSignatureFragmentShader = FRAGMENT;
      // Warm the effect detached; a not-yet-compiled pass must not black out a flight.
      pass = new B.PostProcess('sceneSignature', 'sceneSignature', ['sceneEnergy', 'sceneTexel'], null,
        1, null, B.Texture.BILINEAR_SAMPLINGMODE, scene.getEngine());
      pass.onApply = effect => {
        effect.setFloat('sceneEnergy', materialEnergy);
        effect.setFloat2('sceneTexel', 1 / Math.max(1, scene.getEngine().getRenderWidth()), 1 / Math.max(1, scene.getEngine().getRenderHeight()));
      };
    }
    const active = eligible && running && energy > SCENE_ENERGY_CALM + 0.001 && pass?.isReady();
    if (pass && active && !attached) { camera.attachPostProcess(pass); attached = true; }
    if (pass && !active && attached) { camera.detachPostProcess(pass); attached = false; }
  }

  function dispose(): void {
    if (pass) {
      if (attached) camera.detachPostProcess(pass);
      pass.dispose();
      pass = null;
      attached = false;
    }
  }

  return { sync, dispose };
}
