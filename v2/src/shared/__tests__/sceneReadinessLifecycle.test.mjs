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
const quality = moduleUrl(source('../../features/arena/arenaQuality.ts'));
const arenaModule = moduleUrl('export const installArena = (...args) => globalThis.__m4aInstallArena(...args);');
const webgl = moduleUrl('export const webglAvailable = () => globalThis.__m4aWebglAvailable !== false;');

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
    .replace("from '@/features/arena/arenaQuality'", `from '${quality}'`)
    .replace("from '@/shared/utils/webgl'", `from '${webgl}'`)
    .replace("from './skyBodies'", `from '${moduleUrl(source('../../features/starfield/skyBodies.ts').replace("from '@/shared/utils/frameTime'", `from '${time}'`))}'`)
    .replace("import('@/features/arena/installArena')", `import('${arenaModule}')`)
    .replace("from '@/shared/utils/preloadScene'", `from '${loader}'`)
    // M1 separately executes the real builders with NullEngine. Isolate only the
    // effect's lifecycle here so textures and WebGL cannot hide readiness bugs.
    .replace('const scene = buildScene(BABYLON, engine, () => dt);', 'const scene = globalThis.__m4aScene;');
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

for (const reduced of [false, true]) {
  test(`the shipped scene publishes frame only after executeWhenReady and a rendered complete frame, and home only when the 3D emblem has drawn (reduced=${reduced})`, async () => {
    const keys = ['window', 'document', '__m4aCanvas', '__m4aLoad', '__m4aScene', '__m4aInstallArena'];
    const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
    const preference = { matches: reduced, addEventListener() {}, removeEventListener() {} };
    const readinessUrl = moduleUrl(source('../../features/starfield/sceneReadiness.ts') + `\n// reduced=${reduced}`);
    const { sceneReadiness: readiness } = await import(readinessUrl);
    const observed = [];
    readiness.subscribe(() => observed.push(readiness.getSnapshot()));
    let frames = 0, ready, render, stopped = 0, disposed = 0, scalingLevel = null, engineOptions = null;
    class Engine {
      constructor(_canvas, antialias, options) { engineOptions = { antialias, ...options }; }
      getDeltaTime() { return 1000 / 60; }
      runRenderLoop(callback) { render = callback; }
      stopRenderLoop() { stopped++; }
      setHardwareScalingLevel(level) { scalingLevel = level; }
      dispose() { disposed++; }
      resize() {}
    }
    const arenaFrames = [], contexts = [];
    let arenaDisposed = 0;
    const root = { dataset: {} };
    globalThis.window = { innerWidth: 1000, devicePixelRatio: 2, addEventListener() {}, removeEventListener() {}, matchMedia: () => preference };
    globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
    globalThis.__m4aCanvas = { dataset: {}, closest: () => root };
    globalThis.__m4aLoad = () => Promise.resolve({ Engine });
    globalThis.__m4aScene = { render: () => frames++, executeWhenReady: callback => { ready = callback; }, dispose() {} };
    globalThis.__m4aInstallArena = async (_B, _engine, context) => {
      contexts.push(context);
      return { render: dt => arenaFrames.push(dt), dispose: () => { arenaDisposed++; } };
    };
    const probe = await import(hooks);
    probe.begin();
    let cleanup;
    try {
      const { default: StarfieldBackground } = await import(moduleUrl(wiredScene(readinessUrl)));
      StarfieldBackground({ suspended: false });
      probe.effects[0](); cleanup = probe.effects[1]();
      await flush();
      assert.deepEqual(observed, ['module']);
      assert.equal(frames, 1, 'the initial incomplete static render does not count as ready');
      assert.equal(probe.values[0], false);
      assert.deepEqual(engineOptions.antialias, true, 'a desktop context has MSAA');
      assert.equal(scalingLevel, 1 / 1.5, 'the canvas is rendered at 1.5x the CSS size on a 2x screen');
      assert.equal(contexts.length, 1, 'the 3D emblem is built once, from the same engine');
      assert.equal(contexts[0].reducedMotion(), reduced);
      assert.equal(contexts[0].root, root);
      assert.deepEqual(arenaFrames, [], 'the emblem never draws over an incomplete starfield');
      render?.(); assert.equal(readiness.getSnapshot(), 'module');
      assert.deepEqual(arenaFrames, []);
      const before = frames;
      ready();
      assert.deepEqual(observed, ['module', 'scene', 'frame']);
      assert.equal(frames, before + 1);
      assert.equal(probe.values[0], true);
      assert.deepEqual(arenaFrames, [0], 'the complete static frame draws the emblem over the starfield');
      render?.();
      assert.equal(observed.length, 3, 'later renders do not republish frame');
      assert.equal(arenaFrames.length, reduced ? 1 : 2, 'the emblem draws once per starfield frame (a reduced-motion loop draws none)');
      assert.notEqual(readiness.getSnapshot(), 'home', 'home waits for the emblem\'s own first frame');
      contexts[0].onFirstFrame();
      assert.deepEqual(observed, ['module', 'scene', 'frame', 'home']);
      const staticFrames = frames;
      contexts[0].onReady();
      assert.equal(frames, reduced ? staticFrames + 1 : staticFrames, 'a loop that is not running draws the emblem when it is ready; a running one needs nothing');
      cleanup(); cleanup = null;
      const frozen = frames;
      ready(); render?.(); assert.equal(frames, frozen, 'disposed callbacks remain silent');
      assert.equal(disposed, 1); assert.ok(stopped >= 2);
      assert.equal(arenaDisposed, 1, 'the emblem scene goes before the engine');
    } finally {
      cleanup?.();
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
      }
    }
  });
}

test('a 3D emblem that cannot be built releases the age gate anyway and leaves the flat emblem in place', async () => {
  const keys = ['window', 'document', '__m4aCanvas', '__m4aLoad', '__m4aScene', '__m4aInstallArena'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const readinessUrl = moduleUrl(source('../../features/starfield/sceneReadiness.ts') + '\n// arena failure');
  const { sceneReadiness: readiness } = await import(readinessUrl);
  const root = { dataset: {} };
  class Engine { getDeltaTime() { return 16; } runRenderLoop() {} stopRenderLoop() {} setHardwareScalingLevel() {} dispose() {} resize() {} }
  const warn = console.warn; console.warn = () => {};
  globalThis.window = { innerWidth: 1000, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  globalThis.__m4aCanvas = { dataset: {}, closest: () => root };
  globalThis.__m4aLoad = () => Promise.resolve({ Engine });
  globalThis.__m4aScene = { render() {}, executeWhenReady() {}, dispose() {} };
  globalThis.__m4aInstallArena = () => Promise.reject(new Error('emblem.bin: HTTP 404'));
  const probe = await import(hooks);
  probe.begin();
  let cleanup;
  try {
    const { default: StarfieldBackground } = await import(moduleUrl(wiredScene(readinessUrl)));
    StarfieldBackground({ suspended: false });
    probe.effects[0](); cleanup = probe.effects[1]();
    await flush();
    assert.equal(readiness.getSnapshot(), 'home');
    assert.equal(root.dataset.arena, 'unavailable');
  } finally {
    console.warn = warn;
    cleanup?.();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('without WebGL at all the scene stays silent: no failure reaches the boundary, the age gate is released, and the flat emblem stays', async () => {
  const keys = ['window', 'document', '__m4aCanvas', '__m4aLoad', '__m4aScene', '__m4aInstallArena', '__m4aWebglAvailable'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const readinessUrl = moduleUrl(source('../../features/starfield/sceneReadiness.ts') + '\n// no webgl');
  const { sceneReadiness: readiness } = await import(readinessUrl);
  const root = { dataset: {} };
  class Engine { constructor() { throw new Error('WebGL not supported'); } }
  const noise = []; const warn = console.warn, error = console.error;
  console.warn = (...args) => noise.push(args); console.error = (...args) => noise.push(args);
  globalThis.window = { innerWidth: 1000, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  globalThis.__m4aCanvas = { dataset: {}, closest: () => root };
  globalThis.__m4aLoad = () => Promise.resolve({ Engine });
  globalThis.__m4aScene = { render() {}, executeWhenReady() {}, dispose() {} };
  let built = 0;
  globalThis.__m4aInstallArena = async () => { built++; return { render() {}, dispose() {} }; };
  globalThis.__m4aWebglAvailable = false;
  const probe = await import(hooks);
  probe.begin();
  let cleanup;
  try {
    const { default: StarfieldBackground } = await import(moduleUrl(wiredScene(readinessUrl)));
    StarfieldBackground({ suspended: false });
    probe.effects[0](); cleanup = probe.effects[1]();
    await flush();
    assert.equal(probe.values[1], null, 'nothing is thrown to the WebGL boundary (React would log it as an error)');
    assert.equal(readiness.getSnapshot(), 'home', 'no 3D scene is coming: the age gate need not wait');
    assert.equal(built, 0, 'no emblem scene is built without an engine');
    assert.equal(root.dataset.arena, undefined, 'the flat emblem stays: only a drawn emblem sets data-arena');
    assert.deepEqual(noise, [], 'and nothing is logged');
  } finally {
    console.warn = warn; console.error = error;
    cleanup?.();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('an engine that fails although WebGL exists is still reported to the boundary', async () => {
  const keys = ['window', 'document', '__m4aCanvas', '__m4aLoad', '__m4aScene', '__m4aInstallArena', '__m4aWebglAvailable'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const readinessUrl = moduleUrl(source('../../features/starfield/sceneReadiness.ts') + '\n// engine failure');
  const { sceneReadiness: readiness } = await import(readinessUrl);
  class Engine { constructor() { throw new Error('GPU process crashed'); } }
  const warn = console.warn; console.warn = () => {};
  globalThis.window = { innerWidth: 1000, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  globalThis.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
  globalThis.__m4aCanvas = { dataset: {}, closest: () => ({ dataset: {} }) };
  globalThis.__m4aLoad = () => Promise.resolve({ Engine });
  globalThis.__m4aScene = { render() {}, executeWhenReady() {}, dispose() {} };
  globalThis.__m4aInstallArena = async () => ({ render() {}, dispose() {} });
  globalThis.__m4aWebglAvailable = true;
  const probe = await import(hooks);
  probe.begin();
  let cleanup;
  try {
    const { default: StarfieldBackground } = await import(moduleUrl(wiredScene(readinessUrl)));
    StarfieldBackground({ suspended: false });
    probe.effects[0](); cleanup = probe.effects[1]();
    await flush();
    assert.ok(probe.values[1] instanceof Error && /GPU process crashed/.test(probe.values[1].message), 'the failure goes to the boundary as before');
  } finally {
    console.warn = warn;
    cleanup?.();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

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
