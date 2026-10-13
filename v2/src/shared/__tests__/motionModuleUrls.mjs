import assert from 'node:assert/strict';

/** Use the same real-source transpilation as sceneFoundation, with local imports wired. */
export function motionModuleUrls(moduleUrl, source, timeUrl, { mutateCamera = false, mutatePanel = false } = {}) {
  const urls = { '@/shared/utils/frameTime': timeUrl };
  const compile = (path, names, mutate) => {
    let src = source(path);
    if (mutate) src = mutate(src);
    for (const [name, url] of Object.entries(urls)) src = src.replaceAll(`from '${name}'`, `from '${url}'`);
    const url = moduleUrl(src);
    for (const name of names) urls[name] = url;
    return url;
  };
  const tokens = compile('../motion/tokens.ts', ['./tokens', '@/shared/motion/tokens']);
  const transition = compile('../motion/transition.ts', ['./transition', '@/shared/motion/transition'], mutatePanel ? src => {
    const target = "const immediate = target !== 'none' && timeline.panelAtMs === 0;";
    assert.ok(src.includes(target), 'immediate-panel mutation target not found');
    return src.replace(target, "const immediate = target !== 'none';");
  } : undefined);
  const store = compile('../motion/transitionStore.ts', ['@/shared/motion/transitionStore']);
  const tween = compile('../motion/cameraTween.ts', ['@/shared/motion/cameraTween'], mutateCamera ? src => {
    const target = 'const t = cameraEase(progress);';
    assert.ok(src.includes(target), 'open-ended camera mutation target not found');
    // The retired 0.02 exponential step, expressed in elapsed time as in M1.
    return src.replace(target, 'const t = 1 - Math.pow(0.98, Math.max(0, now - tween.startedAt) / (1000 / 60));');
  } : undefined);
  const chapters = compile('../../features/journey/chapters.ts', ['./chapters', '@/features/journey/chapters']);
  const journey = compile('../../features/journey/journeyMotion.ts', ['@/features/journey/journeyMotion']);
  const camera = compile('../../features/starfield/cameraNarrative.ts', ['./cameraNarrative']);
  return { tokens, transition, store, tween, chapters, journey, camera };
}
