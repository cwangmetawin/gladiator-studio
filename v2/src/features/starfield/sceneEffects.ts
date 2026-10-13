import { transitionStore } from '@/shared/motion/transitionStore';
import { skyStore } from './skyStore';
import { advanceSceneEnergy, SCENE_ENERGY_CALM } from './sceneEnergy';
import { mirrorSceneEnergy } from './sceneEnergyAttribute';
import { createBrandMaterialResponse } from './brandMaterial';
import { sceneFxFlags } from './sceneFxFlags';
import { createScenePostProcess } from './scenePostProcess';
import { installSceneGpuMetrics } from './sceneGpuMetrics';

type BabylonModule = typeof import('@/shared/babylon/babylonCore');

/** Install after M3 so the sampled drag strength and base nebula tint are current. */
export function installSceneEffects(B: BabylonModule, scene: InstanceType<BabylonModule['Scene']>, engine: InstanceType<BabylonModule['Engine']>,
  root: HTMLElement | null, deltaSeconds: () => number, reducedMotion: () => boolean) {
  const flags = sceneFxFlags(window.location.search);
  const materials = scene.materials.filter(material => material.name.startsWith('navMat_')) as InstanceType<BabylonModule['StandardMaterial']>[];
  const nebula = scene.layers.find(layer => layer.name === 'nebulaBg')!;
  const brand = createBrandMaterialResponse(B, materials, nebula, flags.enabled);
  const post = createScenePostProcess(B, scene, scene.activeCamera!, flags.enabled);
  const metrics = installSceneGpuMetrics(B, engine, window, flags.measure);
  let energy = SCENE_ENERGY_CALM;
  let running = false;

  function setRunning(value: boolean): void {
    running = value;
    post.sync(skyStore.phone, reducedMotion(), running, brand.readEnergy());
    metrics.setRunning(value);
  }

  scene.onBeforeRenderObservable.add(() => {
    energy = flags.enabled ? advanceSceneEnergy(energy, transitionStore.getSnapshot(), skyStore.trail.state.strength, reducedMotion(), deltaSeconds()) : SCENE_ENERGY_CALM;
    brand.write(energy, skyStore.tint);
    mirrorSceneEnergy(root, brand.readEnergy);
    post.sync(skyStore.phone, reducedMotion(), running, brand.readEnergy());
  });
  scene.onDisposeObservable.addOnce(() => { post.dispose(); metrics.dispose(); });
  return { setRunning };
}
