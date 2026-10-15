// Run with npm run test:unit. Transpile and import the shipped TS/TSX sources.
// MUTATE_FRAME_TIME=1 restores a frame-counted approach step (red).
// MUTATE_RENDER_DPR=1 removes the shared DPR cap (red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { motionModuleUrls } from './motionModuleUrls.mjs';
import { skyModuleUrls } from './skyModuleUrls.mjs';
import { sceneLoadingModuleUrls } from './sceneLoadingModuleUrls.mjs';
import { sceneEffectsModuleUrls } from './sceneEffectsModuleUrls.mjs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');
const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const moduleUrl = (src) => {
  const js = ts.transpileModule(src, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
    .replace(/from ['"](react(?:\/jsx-runtime)?|@babylonjs\/core\/[^'"]+)['"]/g, (_match, name) =>
      `from '${pathToFileURL(require.resolve(name)).href}'`)
    .replace(/import ['"](@babylonjs\/core\/[^'"]+)['"]/g, (_match, name) =>
      `import '${pathToFileURL(require.resolve(name)).href}'`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
};

let timeSource = source('../utils/frameTime.ts');
if (process.env.MUTATE_FRAME_TIME === '1') {
  const target = '1 - Math.exp(-rate * dt)';
  assert.ok(timeSource.includes(target), 'frame-time mutation target not found');
  timeSource = timeSource.replace(target, '1 - Math.exp(-rate / REFERENCE_FPS)');
}
const timeUrl = moduleUrl(timeSource);
const motionUrls = motionModuleUrls(moduleUrl, source, timeUrl);
const skyUrls = skyModuleUrls(moduleUrl, source);
const loadingUrls = sceneLoadingModuleUrls(moduleUrl, source);
const effectsUrls = sceneEffectsModuleUrls(moduleUrl, source, timeUrl, motionUrls, skyUrls);
const { approach, approachRate, frameDeltaSeconds, perSecond, secondsFromFrames, tweenProgress } = await import(timeUrl);
const timeImports = (src) => src.replace("from '@/shared/utils/frameTime'", `from '${timeUrl}'`);
const loopUrl = moduleUrl(timeImports(source('../../features/starfield/renderLoop.ts')));
const { createRenderLoop, shouldRunRenderLoop } = await import(loopUrl);
const twinkleUrl = moduleUrl(timeImports(source('../../features/starfield/starTwinkle.ts')));
const { createStarTwinkle } = await import(twinkleUrl);

let resolutionSource = source('../utils/renderResolution.ts');
if (process.env.MUTATE_RENDER_DPR === '1') {
  const target = 'Math.min(dpr, MAX_RENDER_DPR)';
  assert.ok(resolutionSource.includes(target), 'DPR mutation target not found');
  resolutionSource = resolutionSource.replace(target, 'dpr');
}
const { cappedDevicePixelRatio, hardwareScalingLevel } = await import(moduleUrl(resolutionSource));

const within = (actual, expected, tolerance, label) => {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
};

test('approach agrees at 30/60/120 Hz and preserves the old 60 Hz result within 1%', () => {
  for (const factor of [0.02, 0.03, 0.04, 0.06]) {
    let legacy = 0;
    for (let frame = 0; frame < 60; frame++) legacy += (1 - legacy) * factor;
    for (const hz of [30, 60, 120]) {
      let value = 0;
      for (let frame = 0; frame < hz; frame++) value = approach(value, 1, approachRate(factor), frameDeltaSeconds(1000 / hz));
      within(value, legacy, legacy * 0.01, `factor ${factor}, ${hz} Hz`);
    }
  }
});

test('the retired entry duration converts 120 frames to two seconds at 30/60/120 Hz within 5%', () => {
  // The retired meshes no longer run this tween; verify the shared duration
  // conversion and progress used by the remaining panel-light fade.
  const duration = secondsFromFrames(120);
  assert.equal(duration, 2);
  for (const hz of [30, 60, 120]) {
    let elapsed = 0;
    let frames = 0;
    while (tweenProgress(elapsed, duration) < 1) {
      elapsed += frameDeltaSeconds(1000 / hz);
      frames++;
    }
    within(frames / hz, 2, 2 * 0.05, `${hz} Hz entry duration`);
    within(tweenProgress(1, duration), 0.5, 1e-12, 'entry midpoint');
  }
});

test('linear motion and the 30-frame panel-light fade preserve their 60 Hz pace', () => {
  for (const hz of [30, 60, 120]) {
    let angle = 0;
    let elapsed = 0;
    for (let frame = 0; frame < hz; frame++) {
      const dt = frameDeltaSeconds(1000 / hz);
      angle += perSecond(0.00018) * dt;
      elapsed += dt;
    }
    within(angle, 60 * 0.00018, 1e-12, `${hz} Hz Earth spin`);
    within(tweenProgress(elapsed / 4, secondsFromFrames(30)), 0.5, 1e-12, `${hz} Hz light midpoint`);
  }
});

test('engine deltas are seconds, non-negative and capped after a long pause', () => {
  within(frameDeltaSeconds(1000 / 60), 1 / 60, 1e-12, 'normal delta');
  assert.equal(frameDeltaSeconds(10000), 0.1);
  assert.equal(frameDeltaSeconds(0), 0);
  assert.equal(frameDeltaSeconds(-10), 0);
});

test('reduced motion, a hidden tab or suspension independently stop the render loop', () => {
  for (const reducedMotion of [false, true]) {
    for (const hidden of [false, true]) {
      for (const suspended of [false, true]) {
        assert.equal(shouldRunRenderLoop(Object.freeze({ reducedMotion, hidden, suspended })),
          !(reducedMotion || hidden || suspended));
      }
    }
  }
});

test('freeze paints one final frame, resume drops stale time, and cleanup prevents queued renders', () => {
  let state = { reducedMotion: false, hidden: false, suspended: false };
  let delta = 1000 / 60;
  let callback;
  let starts = 0;
  let stops = 0;
  const rendered = [];
  const loop = createRenderLoop({
    getState: () => state,
    getDeltaTime: () => delta,
    render: (dt) => rendered.push(dt),
    start: (render) => { callback = render; starts++; },
    stop: () => { stops++; },
  });
  loop.startLoop();
  assert.deepEqual(rendered, [0]);
  callback();
  callback();
  within(rendered.at(-1), 1 / 60, 1e-12, 'running delta');

  for (const reason of ['suspended', 'hidden', 'reducedMotion']) {
    state = { ...state, [reason]: true };
    const before = rendered.length;
    const startsBefore = starts;
    loop.startLoop();
    assert.equal(rendered.length, before + 1);
    assert.equal(rendered.at(-1), 0);
    assert.equal(starts, startsBefore);
    callback(); // A callback already queued by the engine must stay silent.
    assert.equal(rendered.length, before + 1);

    delta = 60000;
    state = { ...state, [reason]: false };
    loop.startLoop();
    assert.equal(rendered.at(-1), 0); // The preserved buffer is refreshed now.
    callback();
    assert.equal(rendered.at(-1), 0); // First RAF ignores the stale engine delta.
    callback();
    assert.equal(rendered.at(-1), 0.1); // Subsequent deltas are still clamped.
  }
  assert.equal(starts, 4);
  assert.equal(stops, 7);
  loop.dispose();
  const before = rendered.length;
  callback();
  loop.renderStatic();
  loop.startLoop();
  assert.equal(rendered.length, before);
});

test('effective DPR is 1, 2 and 2 at device DPR 1, 2 and 3', () => {
  for (const [dpr, expected] of [[1, 1], [2, 2], [3, 2]]) {
    assert.equal(cappedDevicePixelRatio(dpr), expected, `2D canvas DPR ${dpr}`);
    assert.equal(1 / hardwareScalingLevel(dpr), expected, `Babylon effective DPR ${dpr}`);
  }
});

test('twinkle preserves alpha, phase and speed while throttling uploads to 30 Hz', () => {
  for (const hz of [30, 60, 120]) {
    const data = Object.freeze({
      baseAlpha: new Float32Array([0.8, 0.5]),
      twPhase: new Float32Array([0.4, 1.2]),
      twSpeed: new Float32Array([0.6, 2.8]),
      colors: new Float32Array([0.7, 0.8, 1, 0.8, 1, 0.9, 0.6, 0.5]),
    });
    const rgbBefore = [...data.colors].filter((_value, i) => i % 4 !== 3);
    let uploads = 0;
    const update = createStarTwinkle(data, () => { uploads++; });
    for (let frame = 0; frame < hz; frame++) {
      update(frameDeltaSeconds(1000 / hz));
      for (let star = 0; star < data.baseAlpha.length; star++) {
        const fraction = data.colors[star * 4 + 3] / data.baseAlpha[star];
        assert.ok(fraction >= 0.35 - 1e-6 && fraction <= 1 + 1e-6);
      }
    }
    assert.equal(uploads, 30, `${hz} Hz upload count`);
    for (let star = 0; star < data.baseAlpha.length; star++) {
      const legacy = data.baseAlpha[star] * (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(data.twPhase[star] + 60 * 0.05 * data.twSpeed[star])));
      within(data.colors[star * 4 + 3], legacy, 1e-6, `${hz} Hz star ${star}`);
    }
    assert.deepEqual([...data.colors].filter((_value, i) => i % 4 !== 3), rgbBefore);
    update(0);
    assert.equal(uploads, 30, 'static renders do not upload or advance twinkle');
  }
});

test('the real star builder gives Babylon an updatable colour buffer and static positions', async () => {
  const { NullEngine } = await import(pathToFileURL(require.resolve('@babylonjs/core/Engines/nullEngine.js')).href);
  const B = await import(moduleUrl(source('../babylon/babylonCore.ts')));
  const eventUrl = moduleUrl(source('../utils/sceneEvents.ts'));
  const soundUrl = moduleUrl('export const soundEngine = {};');
  const starfieldSource = timeImports(source('../../features/starfield/StarfieldBackground.tsx'))
    .replace("from '@/shared/utils/sceneEvents'", `from '${eventUrl}'`)
    .replace("from '@/shared/utils/soundEngine'", `from '${soundUrl}'`)
    .replace("from './renderLoop'", `from '${loopUrl}'`)
    .replace("from './starTwinkle'", `from '${twinkleUrl}'`)
    .replace("from '@/shared/motion/transitionStore'", `from '${motionUrls.store}'`)
    .replace("from './cameraNarrative'", `from '${motionUrls.camera}'`)
    .replace("from './gameSkyRenderer'", `from '${skyUrls.renderer}'`)
    .replace("from './skyStore'", `from '${skyUrls.store}'`)
    .replace("from './sceneReadiness'", `from '${loadingUrls.readiness}'`)
    .replace("from './sceneEffects'", `from '${effectsUrls.effects}'`)
    .replace("from '@/features/arena/arenaQuality'", `from '${moduleUrl(source('../../features/arena/arenaQuality.ts'))}'`)
    .replace("from '@/shared/utils/webgl'", `from '${moduleUrl('export const webglAvailable = () => true;')}'`)
    .replace("from '@/shared/utils/preloadScene'", `from '${loadingUrls.preload}'`)
    .replace('function buildStarField(', 'export function buildStarField(');
  const { buildStarField } = await import(moduleUrl(starfieldSource));
  const engine = new NullEngine();
  const scene = new B.Scene(engine);
  try {
    const mesh = buildStarField(B, scene);
    assert.equal(mesh.getVertexBuffer('color').isUpdatable(), true);
    assert.equal(mesh.getVertexBuffer('position').isUpdatable(), false);
    const before = [...mesh.getVerticesData('color')];
    const update = createStarTwinkle(mesh.metadata, (colors) => mesh.updateVerticesData('color', colors));
    update(1 / 30);
    assert.notDeepEqual([...mesh.getVerticesData('color')], before);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
