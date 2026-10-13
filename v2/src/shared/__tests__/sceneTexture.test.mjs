// npm run test:unit. MUTATE_SCENE_ENERGY_DRAG=1 disconnects drag in the transpiled TS copy (red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { moduleUrl, source } from './sourceModule.mjs';
import { motionModuleUrls } from './motionModuleUrls.mjs';
import { skyModuleUrls } from './skyModuleUrls.mjs';
import { sceneEffectsModuleUrls } from './sceneEffectsModuleUrls.mjs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const energySource = path => {
  const src = source(path);
  if (process.env.MUTATE_SCENE_ENERGY_DRAG !== '1' || !path.endsWith('/sceneEnergy.ts')) return src;
  const target = 'const dragEnergy = SCENE_ENERGY_CALM + (1 - SCENE_ENERGY_CALM) * trail;';
  assert.ok(src.includes(target), 'drag-energy mutation target not found');
  return src.replace(target, 'const dragEnergy = SCENE_ENERGY_CALM;');
};
const time = moduleUrl(source('../utils/frameTime.ts'));
const motion = motionModuleUrls(moduleUrl, source, time);
const sky = skyModuleUrls(moduleUrl, source);
const urls = sceneEffectsModuleUrls(moduleUrl, energySource, time, motion, sky);
const { advanceSceneEnergy, sceneEnergyTarget, SCENE_ENERGY_CALM, SCENE_ENERGY_FLIGHT } = await import(urls.energy);
const { SCENE_ENERGY_VALUES, mirrorSceneEnergy } = await import(urls.attribute);
const { createBrandMaterialResponse } = await import(urls.brand);
const { sceneFxFlags } = await import(urls.flags);
const { createScenePostProcess } = await import(urls.post);
const { installSceneGpuMetrics } = await import(urls.gpu);
const { initialTransition, transitionReducer } = await import(motion.transition);
const { transitionTimeline } = await import(motion.tokens);
const { frameDeltaSeconds } = await import(time);
const titleUrl = moduleUrl(source('../motion/titleMotion.ts').replace("from './tokens'", `from '${motion.tokens}'`));
const { panelTitleReveal } = await import(titleUrl);
const coreUrl = moduleUrl(source('../babylon/babylonCore.ts'));
const B = await import(coreUrl);
const { NullEngine } = await import(pathToFileURL(require.resolve('@babylonjs/core/Engines/nullEngine.js')).href);

const request = (state, target, now = 0) => transitionReducer(state, { type: 'request', target, now });
const settle = state => transitionReducer(state, { type: 'tick', now: state.startedAt + transitionTimeline(state.mode, state.kind).totalMs });
const within = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);
function simulate(energy, state, trail, seconds, hz, reduced = false) {
  for (let frame = 0; frame < Math.round(seconds * hz); frame++) energy = advanceSceneEnergy(energy, state, trail, reduced, frameDeltaSeconds(1000 / hz));
  return energy;
}

test('open and switch flights raise scene energy; the presented panel and hub settle to exact calm', () => {
  const opening = request(initialTransition(), 'about');
  assert.equal(opening.phase, 'flying');
  assert.equal(sceneEnergyTarget(opening, 0, false), SCENE_ENERGY_FLIGHT);
  const raised = simulate(SCENE_ENERGY_CALM, opening, 0, 0.25, 60);
  assert.ok(raised > 0.85, `navigation must visibly raise the material input: ${raised}`);
  const opened = settle(opening);
  assert.equal(sceneEnergyTarget(opened, 0, false), SCENE_ENERGY_CALM);
  const switching = request(opened, 'team', 1000);
  assert.equal(switching.kind, 'switch');
  assert.ok(simulate(SCENE_ENERGY_CALM, switching, 0, 0.25, 60) > 0.85);
  const hub = settle(request(settle(switching), 'none', 2000));
  assert.equal(hub.phase, 'idle');
  assert.equal(simulate(raised, hub, 0, 4, 60), SCENE_ENERGY_CALM);
});

test('trail strength one raises calm energy quickly even with no navigation flight', () => {
  const idle = initialTransition();
  assert.equal(sceneEnergyTarget(idle, 1, false), 1);
  const raised = simulate(SCENE_ENERGY_CALM, idle, 1, 0.1, 120);
  assert.ok(raised > 0.7, `drag must reach a visible response within 100 ms: ${raised}`);
});

test('one second of energy decay agrees at 30 and 120 fps within 0.01', () => {
  const idle = initialTransition();
  const slow = simulate(1, idle, 0, 1, 30);
  const fast = simulate(1, idle, 0, 1, 120);
  within(slow, fast, 0.01);
  within(slow, SCENE_ENERGY_CALM + (1 - SCENE_ENERGY_CALM) * Math.exp(-3));
});

test('reduced motion holds exactly calm for navigation, drag and elapsed-time changes', () => {
  const flight = request(initialTransition('reduced'), 'games');
  for (const hz of [30, 120]) {
    assert.equal(simulate(1, flight, 1, 1, hz, true), SCENE_ENERGY_CALM);
    assert.equal(advanceSceneEnergy(0.8, flight, 1, true, 0), SCENE_ENERGY_CALM);
  }
  for (const trail of [-10, 0, 1, 20, NaN, Infinity]) {
    const target = sceneEnergyTarget(initialTransition(), trail, false);
    assert.ok(target >= 0 && target <= 1);
  }
});

test('query flags disable both responses and permit an instrumented off baseline', () => {
  assert.deepEqual(sceneFxFlags(''), { enabled: true, measure: false });
  assert.deepEqual(sceneFxFlags('?fx=off'), { enabled: false, measure: false });
  assert.deepEqual(sceneFxFlags('?fx=measure'), { enabled: true, measure: true });
  assert.deepEqual(sceneFxFlags('?fx=off&fx=measure'), { enabled: false, measure: true });
});

function postFixture() {
  const created = [], attached = [];
  let ready = false, disposed = 0;
  const camera = {
    attachPostProcess: pass => attached.push(pass),
    detachPostProcess: pass => { const at = attached.indexOf(pass); if (at >= 0) attached.splice(at, 1); },
  };
  const engine = { getRenderWidth: () => 2560, getRenderHeight: () => 1440 };
  const scene = { getEngine: () => engine };
  const babylon = {
    Effect: { ShadersStore: {} }, Texture: { BILINEAR_SAMPLINGMODE: 2 },
    PostProcess: class {
      constructor(...args) { this.args = args; created.push(this); }
      isReady() { return ready; }
      dispose() { disposed++; }
    },
  };
  return { created, attached, camera, engine, scene, babylon, setReady: () => { ready = true; }, get disposed() { return disposed; } };
}

test('the actual post factory creates only for desktop, normal motion and enabled fx', () => {
  for (const phone of [false, true]) for (const reduced of [false, true]) for (const enabled of [false, true]) {
    const f = postFixture();
    const post = createScenePostProcess(f.babylon, f.scene, f.camera, enabled);
    post.sync(phone, reduced, false, 0.9);
    assert.equal(f.created.length, 0, 'stopped scenes never create a pass');
    post.sync(phone, reduced, true, 0.9);
    assert.equal(f.created.length, !phone && !reduced && enabled ? 1 : 0);
    assert.equal(f.attached.length, 0, 'compilation must complete before attachment');
    post.dispose();
  }
});

test('one warmed post reuses capped scene resolution, uploads material energy, and detaches on every pause', () => {
  const f = postFixture();
  const post = createScenePostProcess(f.babylon, f.scene, f.camera, true);
  post.sync(false, false, true, SCENE_ENERGY_CALM);
  assert.equal(f.created.length, 1);
  assert.equal(f.created[0].args[4], 1, 'ratio 1 preserves the scene resolution cap');
  assert.equal(f.created[0].args[5], null, 'warmup does not attach');
  assert.equal(f.attached.length, 0, 'the exact-rest hub keeps its original render path');
  f.setReady();
  post.sync(false, false, true, 0.84);
  post.sync(false, false, true, 0.84);
  assert.equal(f.attached.length, 1);
  const uploads = [];
  f.created[0].onApply({ setFloat: (...args) => uploads.push(args), setFloat2: (...args) => uploads.push(args) });
  assert.deepEqual(uploads, [['sceneEnergy', 0.84], ['sceneTexel', 1 / 2560, 1 / 1440]]);
  for (const [phone, reduced, running, energy] of [[false, false, false, 0.84], [true, false, true, 0.84], [false, true, true, 0.84], [false, false, true, SCENE_ENERGY_CALM]]) {
    post.sync(phone, reduced, running, energy);
    assert.equal(f.attached.length, 0);
    post.sync(false, false, true, 0.84);
    assert.equal(f.attached.length, 1);
    assert.equal(f.created.length, 1, 'resume reuses the warmed pass');
  }
  post.dispose(); post.dispose();
  assert.equal(f.attached.length, 0);
  assert.equal(f.disposed, 1);
});

function materialFixture() {
  const engine = new NullEngine();
  const scene = new B.Scene(engine);
  const materials = [[0.18, 0.18, 0.2], [0.42, 0.38, 0.28]].map((rgb, i) => {
    const mat = new B.StandardMaterial(`navMat_${i}`, scene);
    mat.emissiveColor = new B.Color3(...rgb);
    return mat;
  });
  const nebula = new B.Layer('nebulaBg', null, scene, true);
  nebula.color = new B.Color4(0.6, 0.6, 0.66, 1);
  return { materials, nebula, engine, scene, dispose: () => { scene.dispose(); engine.dispose(); } };
}

test('?fx=off keeps real Babylon materials, fresnel and nebula at captured rest values', () => {
  const f = materialFixture();
  try {
    const rest = f.materials.map(mat => mat.emissiveColor.asArray());
    const fresnelRest = f.materials.map(mat => mat.emissiveFresnelParameters);
    const nebulaRest = f.nebula.color.asArray();
    const brand = createBrandMaterialResponse(B, f.materials, f.nebula, sceneFxFlags('?fx=off').enabled);
    for (const energy of [SCENE_ENERGY_CALM, 0.9, 1]) {
      brand.write(energy, { r: 0.6, g: 0.6, b: 0.66 });
      assert.deepEqual(f.materials.map(mat => mat.emissiveColor.asArray()), rest);
      assert.deepEqual(f.materials.map(mat => mat.emissiveFresnelParameters), fresnelRest);
      assert.deepEqual(f.nebula.color.asArray(), nebulaRest);
      within(brand.readEnergy(), SCENE_ENERGY_CALM);
    }
  } finally { f.dispose(); }
});

test('brand response is identical at calm and exposes the material value, including an external write', () => {
  const f = materialFixture();
  try {
    const rest = f.materials.map(mat => mat.emissiveColor.asArray());
    const tint = { r: 0.58, g: 0.55, b: 0.64 };
    const brand = createBrandMaterialResponse(B, f.materials, f.nebula, true);
    brand.write(SCENE_ENERGY_CALM, tint);
    assert.deepEqual(f.materials.map(mat => mat.emissiveColor.asArray()), rest);
    assert.deepEqual(f.nebula.color.asArray(), [tint.r, tint.g, tint.b, 1]);
    assert.deepEqual(f.materials[0].emissiveFresnelParameters.leftColor.asArray(), [1, 1, 1]);
    brand.write(0.8, tint);
    within(brand.readEnergy(), 0.8);
    assert.ok(f.materials.every(mat => mat.emissiveFresnelParameters.leftColor.b > 2));
    assert.ok(f.nebula.color.b > tint.b);
    // This is deliberately independent of the energy model and any store.
    f.materials[0].emissiveColor.g = rest[0][1] + 0.08 * (0.61 - SCENE_ENERGY_CALM) / (1 - SCENE_ENERGY_CALM);
    const root = { dataset: {} };
    mirrorSceneEnergy(root, brand.readEnergy);
    assert.equal(root.dataset.sceneEnergy, '0.61');
    brand.write(SCENE_ENERGY_CALM, tint);
    assert.deepEqual(f.materials.map(mat => mat.emissiveColor.asArray()), rest);
  } finally { f.dispose(); }
});

test('energy attributes use pooled two-decimal strings, read once, and skip unchanged DOM writes', () => {
  assert.equal(SCENE_ENERGY_VALUES.length, 101);
  assert.ok(Object.isFrozen(SCENE_ENERGY_VALUES));
  assert.ok(SCENE_ENERGY_VALUES.every(value => /^(?:0\.\d{2}|1\.00)$/.test(value)));
  let writes = 0, reads = 0, stored, energy = 0.734;
  const dataset = {};
  Object.defineProperty(dataset, 'sceneEnergy', { get: () => stored, set: value => { writes++; stored = value; } });
  const read = () => { reads++; return energy; };
  const fixed = Number.prototype.toFixed;
  Number.prototype.toFixed = () => { throw new Error('per-frame string formatting is forbidden'); };
  try {
    mirrorSceneEnergy({ dataset }, read); mirrorSceneEnergy({ dataset }, read);
    assert.equal(stored, SCENE_ENERGY_VALUES[73]); assert.equal(writes, 1); assert.equal(reads, 2);
    energy = 1.01; mirrorSceneEnergy({ dataset }, read); assert.equal(stored, SCENE_ENERGY_VALUES[100]);
    energy = -0.01; mirrorSceneEnergy({ dataset }, read); assert.equal(stored, SCENE_ENERGY_VALUES[0]);
  } finally { Number.prototype.toFixed = fixed; }
});

test('the shipped adapter carries real navigation and sky-store drag into Babylon materials and the root attribute', async () => {
  const previous = { window: globalThis.window, clock: globalThis.__m4bClock };
  let now = 0, reduced = false, dt = 1 / 60;
  const timers = new Set();
  globalThis.__m4bClock = {
    now: () => now,
    schedule: (callback, delayMs) => { const timer = { callback, at: now + delayMs }; timers.add(timer); return timer; },
    cancel: timer => timers.delete(timer),
  };
  globalThis.window = { innerWidth: 1440, location: { search: '' }, addEventListener() {}, removeEventListener() {} };
  const storeUrl = moduleUrl(`import { createTransitionStore } from '${motion.store}';
    export const transitionStore = createTransitionStore(globalThis.__m4bClock);`);
  const wired = sceneEffectsModuleUrls(moduleUrl, energySource, time, { ...motion, store: storeUrl }, sky);
  const { installSceneEffects } = await import(wired.effects);
  const { transitionStore } = await import(storeUrl);
  const { skyStore } = await import(sky.store);
  const f = materialFixture();
  const root = { dataset: {} };
  try {
    const camera = new B.ArcRotateCamera('mainCamera', -Math.PI / 2, Math.PI / 2.5, 30, B.Vector3.Zero(), f.scene);
    const effects = installSceneEffects(B, f.scene, f.engine, root, () => dt, () => reduced);
    const paint = count => { for (let frame = 0; frame < count; frame++) f.scene.onBeforeRenderObservable.notifyObservers(f.scene); };
    const rest = f.materials[0].emissiveColor.g;
    effects.setRunning(true);
    paint(1); assert.equal(root.dataset.sceneEnergy, '0.18');
    transitionStore.request('about'); paint(16);
    assert.ok(Number(root.dataset.sceneEnergy) > 0.85);
    assert.ok(f.materials[0].emissiveColor.g > rest);
    transitionStore.request('none');
    now = 3000;
    for (const timer of [...timers]) if (timer.at <= now) { timers.delete(timer); timer.callback(); }
    assert.equal(transitionStore.getSnapshot().phase, 'idle');
    paint(240); assert.equal(root.dataset.sceneEnergy, '0.18');
    skyStore.beginDrag(0, now); skyStore.moveDrag(120, now + 100);
    assert.equal(skyStore.trail.state.strength, 1);
    paint(16); assert.ok(Number(root.dataset.sceneEnergy) > 0.95, 'drag must reach the material through the shipped adapter');
    assert.ok(f.nebula.color.b > skyStore.tint.b);
    reduced = true; dt = 0; effects.setRunning(false); paint(1);
    assert.equal(root.dataset.sceneEnergy, '0.18');
    assert.equal(f.materials[0].emissiveColor.g, rest);
    assert.equal(camera._postProcesses.filter(Boolean).length, 0, 'the paused camera has no attached post');
  } finally {
    skyStore.configure(false, true); skyStore.configure(false, false);
    f.dispose();
    if (previous.window === undefined) delete globalThis.window; else globalThis.window = previous.window;
    if (previous.clock === undefined) delete globalThis.__m4bClock; else globalThis.__m4bClock = previous.clock;
  }
});

test('GPU instrumentation loads only on request with WebGL2 timer support and exposes a read-only ms getter', async () => {
  for (const [measure, version, extension] of [[false, 2, {}], [true, 1, {}], [true, 2, null], [true, 2, {}]]) {
    let loads = 0, disposed = 0, instance;
    const counter = { count: 0, current: 0 };
    const babylon = { loadGpuInstrumentation: async () => {
      loads++;
      return { EngineInstrumentation: class {
        constructor() { instance = this; this.gpuFrameTimeCounter = counter; }
        dispose() { disposed++; }
      } };
    } };
    const host = {};
    const metrics = installSceneGpuMetrics(babylon, { webGLVersion: version, getCaps: () => ({ timerQuery: extension }) }, host, measure);
    metrics.setRunning(true);
    await Promise.resolve();
    const supported = measure && version === 2 && extension !== null;
    assert.equal(loads, supported ? 1 : 0);
    assert.equal(host.__sceneGpuMs, undefined);
    if (supported) {
      assert.equal(instance.captureGPUFrameTime, true);
      counter.count = 1; counter.current = 1_750_000;
      assert.equal(host.__sceneGpuMs, 1.75);
      assert.throws(() => { host.__sceneGpuMs = 5; }, TypeError);
      metrics.setRunning(false); assert.equal(instance.captureGPUFrameTime, false);
    }
    metrics.dispose();
    assert.equal(host.__sceneGpuMs, undefined);
    assert.equal(disposed, supported ? 1 : 0);
  }
});

test('optional GPU loading cannot publish a probe after scene disposal', async () => {
  let finish, constructed = 0;
  const host = {};
  const metrics = installSceneGpuMetrics({ loadGpuInstrumentation: () => new Promise(resolve => { finish = resolve; }) },
    { webGLVersion: 2, getCaps: () => ({ timerQuery: {} }) }, host, true);
  metrics.dispose();
  finish({ EngineInstrumentation: class { constructor() { constructed++; } } });
  await Promise.resolve();
  assert.equal(constructed, 0); assert.equal(Object.hasOwn(host, '__sceneGpuMs'), false);
});

test('title wipe uses only paint properties, keeps rest typography, and fits the existing desktop and phone tokens', () => {
  for (const [mode, delayMs, durationMs] of [['desktop', 80, 180], ['phone', 30, 120], ['reduced', 0, 120]]) {
    const reveal = panelTitleReveal(mode, transitionTimeline(mode, 'open'));
    assert.equal(reveal.delayMs, delayMs); assert.equal(reveal.durationMs, durationMs);
    for (const state of [reveal.initial, reveal.animate]) {
      assert.ok(Object.keys(state).every(key => ['opacity', 'y', 'clipPath'].includes(key)), 'layout and letter-spacing must not animate');
    }
    if (mode === 'reduced') {
      assert.deepEqual(reveal.initial, { opacity: 0 }); assert.deepEqual(reveal.animate, { opacity: 1 });
    } else {
      assert.equal(reveal.animate.y, 0);
      // At rest the clip lies outside the heading on every side, so descenders are never cut.
      const insets = (clip) => clip.match(/^inset\((.+)\)$/)[1].split(' ').map(parseFloat);
      assert.ok(insets(reveal.animate.clipPath).every(value => value < 0), reveal.animate.clipPath);
      assert.ok(insets(reveal.initial.clipPath)[2] >= 100, 'the hidden state must cover the whole line');
    }
  }
});
