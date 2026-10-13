import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from './sourceModule.mjs';
import { motionModuleUrls } from './motionModuleUrls.mjs';
import { skyModuleUrls } from './skyModuleUrls.mjs';

const time = moduleUrl(source('../utils/frameTime.ts'));
const motion = motionModuleUrls(moduleUrl, source, time);
const sky = skyModuleUrls(moduleUrl, source);
const loop = moduleUrl(source('../../features/starfield/renderLoop.ts').replace("from '@/shared/utils/frameTime'", `from '${time}'`));
const twinkle = moduleUrl(source('../../features/starfield/starTwinkle.ts').replace("from '@/shared/utils/frameTime'", `from '${time}'`));
const events = moduleUrl(source('../utils/sceneEvents.ts'));
const hooks = moduleUrl(`
  export const effects = [], values = [];
  let refIndex = 0, stateIndex = 0;
  export function begin() { refIndex = stateIndex = 0; effects.length = values.length = 0; }
  export const useEffect = effect => effects.push(effect);
  export const useRef = value => ({ current: refIndex++ === 0 ? globalThis.__m4aCanvas : value });
  export const useState = initial => { const i = stateIndex++; values.push(initial); return [initial, next => { values[i] = next; }]; };
`);
const loader = moduleUrl('export const loadSceneModule = () => globalThis.__m4aLoad();');
const effects = moduleUrl('export const installSceneEffects = () => ({ setRunning() {} });');

function wiredScene(readiness) {
  return source('../../features/starfield/StarfieldBackground.tsx')
    .replace("from 'react'", `from '${hooks}'`)
    .replace("from '@/shared/utils/sceneEvents'", `from '${events}'`)
    .replace("from '@/shared/utils/frameTime'", `from '${time}'`)
    .replace("from './renderLoop'", `from '${loop}'`)
    .replace("from './starTwinkle'", `from '${twinkle}'`)
    .replace("from '@/shared/motion/transitionStore'", `from '${motion.store}'`)
    .replace("from '@/features/journey/journeyMotion'", `from '${motion.journey}'`)
    .replace("from './cameraNarrative'", `from '${motion.camera}'`)
    .replace("from './gameSkyRenderer'", `from '${sky.renderer}'`)
    .replace("from './skyStore'", `from '${sky.store}'`)
    .replace("from './sceneReadiness'", `from '${readiness}'`)
    .replace("from './sceneEffects'", `from '${effects}'`)
    .replace("from '@/shared/utils/preloadScene'", `from '${loader}'`)
    // M1 separately executes the real builders with NullEngine. Isolate only the
    // effect's lifecycle here so textures and WebGL cannot hide readiness bugs.
    .replace('const scene = buildScene(BABYLON, engine, () => dt);', 'const scene = globalThis.__m4aScene;');
}

for (const reduced of [false, true]) {
  test(`the shipped scene publishes frame only after executeWhenReady and a rendered complete frame (reduced=${reduced})`, async () => {
    const keys = ['window', 'document', '__m4aCanvas', '__m4aLoad', '__m4aScene'];
    const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
    const preference = { matches: reduced, addEventListener() {}, removeEventListener() {} };
    const readinessUrl = moduleUrl(source('../../features/starfield/sceneReadiness.ts') + `\n// reduced=${reduced}`);
    const { sceneReadiness: readiness } = await import(readinessUrl);
    const observed = [];
    readiness.subscribe(() => observed.push(readiness.getSnapshot()));
    let frames = 0, ready, render, stopped = 0, disposed = 0;
    class Engine {
      getDeltaTime() { return 1000 / 60; }
      runRenderLoop(callback) { render = callback; }
      stopRenderLoop() { stopped++; }
      dispose() { disposed++; }
      resize() {}
    }
    globalThis.window = { innerWidth: 1000, addEventListener() {}, removeEventListener() {}, matchMedia: () => preference };
    globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
    globalThis.__m4aCanvas = { dataset: {}, closest: () => null };
    globalThis.__m4aLoad = () => Promise.resolve({ Engine });
    globalThis.__m4aScene = { render: () => frames++, executeWhenReady: callback => { ready = callback; }, dispose() {} };
    const probe = await import(hooks);
    probe.begin();
    let cleanup;
    try {
      const { default: StarfieldBackground } = await import(moduleUrl(wiredScene(readinessUrl)));
      StarfieldBackground({ suspended: false });
      probe.effects[0](); cleanup = probe.effects[1]();
      await Promise.resolve(); await Promise.resolve();
      assert.deepEqual(observed, ['module']);
      assert.equal(frames, 1, 'the initial incomplete static render does not count as ready');
      assert.equal(probe.values[0], false);
      render?.(); assert.equal(readiness.getSnapshot(), 'module');
      const before = frames;
      ready();
      assert.deepEqual(observed, ['module', 'scene', 'frame']);
      assert.equal(frames, before + 1);
      assert.equal(probe.values[0], true);
      render?.(); assert.equal(observed.length, 3, 'later renders do not republish frame');
      cleanup(); cleanup = null;
      const frozen = frames;
      ready(); render?.(); assert.equal(frames, frozen, 'disposed callbacks remain silent');
      assert.equal(disposed, 1); assert.ok(stopped >= 2);
    } finally {
      cleanup?.();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
      }
    }
  });
}

test('the shipped preloader waits past public first paint, shares the Babylon promise and primes textures once', async () => {
  const keys = ['window', 'Image', 'requestAnimationFrame'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const requests = [], tasks = [];
  let frame;
  globalThis.window = { setTimeout: callback => tasks.push(callback) };
  globalThis.requestAnimationFrame = callback => { frame = callback; return 1; };
  globalThis.Image = class { set src(src) { requests.push({ src, mode: this.crossOrigin }); } };
  const readiness = moduleUrl(source('../../features/starfield/sceneReadiness.ts') + '\n// preload lifecycle');
  const babylon = moduleUrl('export const chunk = "Babylon";');
  const component = moduleUrl('export default function Scene() {}');
  const preloader = moduleUrl(source('../utils/preloadScene.ts')
    .replace("from '@/features/starfield/sceneReadiness'", `from '${readiness}'`)
    .replaceAll("import('@/shared/babylon/babylonCore')", `import('${babylon}')`)
    .replace("import('@/features/starfield/StarfieldBackground')", `import('${component}')`));
  try {
    const { scheduleScenePreload, preloadScene, loadSceneModule } = await import(preloader);
    const { sceneReadiness: milestones } = await import(readiness);
    scheduleScenePreload();
    assert.equal(requests.length, 0); assert.equal(milestones.getSnapshot(), null);
    frame(); assert.equal(requests.length, 0, 'RAF queues a task instead of fetching in the paint callback');
    tasks.shift()();
    assert.equal(requests.length, 6);
    assert.ok(requests.every(request => request.mode === 'anonymous'));
    const first = loadSceneModule(); assert.equal(loadSceneModule(), first);
    preloadScene(); assert.equal(requests.length, 6);
    assert.equal((await first).chunk, 'Babylon');
    assert.equal(milestones.getSnapshot(), 'module');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
