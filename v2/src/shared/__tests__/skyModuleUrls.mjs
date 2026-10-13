import assert from 'node:assert/strict';

/** Wire real scene modules into data URLs, just like the M1/M2 transpilation helpers. */
export function skyModuleUrls(moduleUrl, source, { mutateGroup = false } = {}) {
  const urls = {};
  const compile = (path, names, mutate) => {
    let src = source(path);
    if (mutate) src = mutate(src);
    for (const [name, url] of Object.entries(urls)) src = src.replaceAll(`from '${name}'`, `from '${url}'`);
    const url = moduleUrl(src);
    for (const name of names) urls[name] = url;
    return url;
  };
  const identity = compile('../../features/starfield/gameIdentity.ts', ['./gameIdentity', '@/features/starfield/gameIdentity']);
  const constellations = compile('../../features/starfield/constellationStore.ts', ['./constellationStore'], mutateGroup ? src => {
    const target = 'if (candidate.key === key)';
    assert.ok(src.includes(target), 'constellation-group mutation target not found');
    return src.replace(target, 'if (candidate.count > 0)');
  } : undefined);
  const trail = compile('../../features/starfield/trailModel.ts', ['./trailModel']);
  const doors = compile('../../features/starfield/doorSelection.ts', ['./doorSelection']);
  const store = compile('../../features/starfield/skyStore.ts', ['./skyStore', '@/features/starfield/skyStore']);
  const renderer = compile('../../features/starfield/gameSkyRenderer.ts', ['./gameSkyRenderer']);
  const focus = compile('../../features/games/catalogueFocus.ts', ['./catalogueFocus']);
  return { identity, constellations, trail, doors, store, renderer, focus };
}
