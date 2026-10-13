/** Compile shipped scene-loading sources, preserving their shared singleton. */
export function sceneLoadingModuleUrls(moduleUrl, source) {
  const readiness = moduleUrl(source('../../features/starfield/sceneReadiness.ts'));
  const preload = moduleUrl(source('../utils/preloadScene.ts')
    .replace("from '@/features/starfield/sceneReadiness'", `from '${readiness}'`));
  const intro = moduleUrl(source('../motion/introTiming.ts'));
  return { readiness, preload, intro };
}
