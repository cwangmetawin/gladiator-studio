import assert from 'node:assert/strict';

/** Use the same real-source transpilation as sceneFoundation, with local imports wired. */
export function motionModuleUrls(moduleUrl, source, timeUrl, { mutatePanel = false } = {}) {
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
  const chapters = compile('../../features/journey/chapters.ts', ['./chapters', '@/features/journey/chapters']);
  const camera = compile('../../features/starfield/cameraNarrative.ts', ['./cameraNarrative']);
  return { tokens, transition, store, chapters, camera };
}
