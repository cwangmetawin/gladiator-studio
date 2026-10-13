/** Wire shipped TS modules using the same transpilation as sceneFoundation. */
export function sceneEffectsModuleUrls(moduleUrl, source, timeUrl, motionUrls, skyUrls) {
  const urls = {
    '@/shared/utils/frameTime': timeUrl,
    '@/shared/motion/transitionStore': motionUrls.store,
    './skyStore': skyUrls.store,
  };
  const compile = (path, name) => {
    let src = source(path);
    for (const [specifier, url] of Object.entries(urls)) src = src.replaceAll(`from '${specifier}'`, `from '${url}'`);
    const url = moduleUrl(src);
    urls[name] = url;
    return url;
  };
  const energy = compile('../../features/starfield/sceneEnergy.ts', './sceneEnergy');
  const attribute = compile('../../features/starfield/sceneEnergyAttribute.ts', './sceneEnergyAttribute');
  const brand = compile('../../features/starfield/brandMaterial.ts', './brandMaterial');
  const flags = compile('../../features/starfield/sceneFxFlags.ts', './sceneFxFlags');
  const post = compile('../../features/starfield/scenePostProcess.ts', './scenePostProcess');
  const gpu = compile('../../features/starfield/sceneGpuMetrics.ts', './sceneGpuMetrics');
  const effects = compile('../../features/starfield/sceneEffects.ts', './sceneEffects');
  return { energy, attribute, brand, flags, post, gpu, effects };
}
