import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from './sourceModule.mjs';
import { sceneLoadingModuleUrls } from './sceneLoadingModuleUrls.mjs';

const urls = sceneLoadingModuleUrls(moduleUrl, source);
const { createSceneReadiness, sceneReadiness } = await import(urls.readiness);
const { initialIntro, advanceIntro, nextIntroDeadline, INTRO_MIN_MS, INTRO_EXIT_MS,
  INTRO_SAFETY_MS, INTRO_REDUCED_FADE_MS } = await import(urls.intro);

test('readiness exposes module, scene and frame in order and resets only the canvas milestones', () => {
  const readiness = createSceneReadiness();
  const observed = [];
  const unsubscribe = readiness.subscribe(() => observed.push(readiness.getSnapshot()));
  readiness.mark('module'); readiness.mark('scene'); readiness.mark('module'); readiness.mark('frame'); readiness.mark('scene');
  assert.deepEqual(observed, ['module', 'scene', 'frame']);
  readiness.resetScene(); assert.equal(readiness.getSnapshot(), 'module');
  readiness.mark('scene'); readiness.mark('frame');
  unsubscribe(); readiness.resetScene(); assert.equal(observed.length, 6);
});

test('a warm frame still holds the 1.2-second brand moment, then finishes its fade within two seconds', () => {
  let intro = initialIntro(100, false);
  intro = advanceIntro(intro, 300, 'frame'); assert.equal(intro.exitAt, null);
  assert.equal(nextIntroDeadline(intro, 'frame'), 100 + INTRO_MIN_MS);
  intro = advanceIntro(intro, 100 + INTRO_MIN_MS - 1, 'frame'); assert.equal(intro.exitAt, null);
  intro = advanceIntro(intro, 100 + INTRO_MIN_MS, 'frame'); assert.equal(intro.exitAt, 1300);
  intro = advanceIntro(intro, 1300 + INTRO_EXIT_MS - 1, 'frame'); assert.equal(intro.complete, false);
  intro = advanceIntro(intro, 1300 + INTRO_EXIT_MS, 'frame'); assert.equal(intro.complete, true);
  assert.ok(1300 + INTRO_EXIT_MS - 100 <= 2000);
  assert.equal(nextIntroDeadline(intro, 'frame'), null);
});

test('module and scene never fade a normal intro early; a late first ready frame releases the calm hold', () => {
  let intro = initialIntro(0, false);
  for (const milestone of [null, 'module', 'scene']) {
    intro = advanceIntro(intro, 3000, milestone);
    assert.equal(intro.exitAt, null);
    assert.equal(nextIntroDeadline(intro, milestone), INTRO_SAFETY_MS);
  }
  intro = advanceIntro(intro, 3500, 'frame'); assert.equal(intro.exitAt, 3500);
  assert.equal(advanceIntro(intro, 3500 + INTRO_EXIT_MS, 'frame').complete, true);
});

test('no WebGL / no frame uses the eight-second safety and still completes with a fade', () => {
  for (const reduced of [false, true]) {
    let intro = initialIntro(20, reduced);
    intro = advanceIntro(intro, 20 + INTRO_SAFETY_MS - 1, 'module'); assert.equal(intro.exitAt, null);
    intro = advanceIntro(intro, 20 + INTRO_SAFETY_MS, 'module'); assert.equal(intro.exitAt, 8020);
    const duration = reduced ? INTRO_REDUCED_FADE_MS : INTRO_EXIT_MS;
    assert.equal(advanceIntro(intro, 8020 + duration, 'module').complete, true);
  }
});

test('reduced motion waits for scene, skips the warp minimum, and has only a short fade', () => {
  let intro = initialIntro(0, true);
  intro = advanceIntro(intro, 50, 'module'); assert.equal(intro.exitAt, null);
  intro = advanceIntro(intro, 75, 'scene'); assert.equal(intro.exitAt, 75);
  assert.equal(nextIntroDeadline(intro, 'scene'), 75 + INTRO_REDUCED_FADE_MS);
  assert.equal(advanceIntro(intro, 75 + INTRO_REDUCED_FADE_MS, 'scene').complete, true);
  assert.equal(advanceIntro(initialIntro(0, true), 60, 'frame').exitAt, 60, 'a coalesced scene/frame publication also works');
});

test('the shipped intro completes without a Canvas context or RAF and unsubscribes on cleanup', async () => {
  const previous = Object.fromEntries(['window', 'performance', 'requestAnimationFrame', 'cancelAnimationFrame'].map(key => [key, globalThis[key]]));
  let now = 0, id = 0, completed = 0;
  const timers = new Map(), preferences = new Map();
  const query = { matches: true, addEventListener: (event, listener) => preferences.set(event, listener), removeEventListener: event => preferences.delete(event) };
  globalThis.performance = { now: () => now };
  globalThis.requestAnimationFrame = () => { throw new Error('reduced motion must not request a warp frame'); };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.window = {
    matchMedia: () => query, devicePixelRatio: 1, innerWidth: 1000, innerHeight: 800,
    addEventListener() {}, removeEventListener() {},
    setTimeout: (callback, delay) => { const token = ++id; timers.set(token, { callback, at: now + delay }); return token; },
    clearTimeout: token => timers.delete(token),
  };
  const hooksUrl = moduleUrl(`
    export const effects = [];
    export const useRef = value => ({ current: value });
    export const useState = value => [typeof value === 'function' ? value() : value, () => {}];
    export const useCallback = fn => fn;
    export const useEffect = fn => effects.push(fn);
  `);
  const timeUrl = moduleUrl(source('../utils/frameTime.ts'));
  const resolutionUrl = moduleUrl(source('../utils/renderResolution.ts'));
  const { WarpIntro } = await import(moduleUrl(source('../components/WarpIntro.tsx')
    .replace("from 'react'", `from '${hooksUrl}'`)
    .replace("from '@/features/starfield/sceneReadiness'", `from '${urls.readiness}'`)
    .replace("from '@/shared/utils/frameTime'", `from '${timeUrl}'`)
    .replace("from '@/shared/utils/renderResolution'", `from '${resolutionUrl}'`)
    .replace("from '@/shared/motion/introTiming'", `from '${urls.intro}'`)));
  const { effects } = await import(hooksUrl);
  const cleanups = [];
  try {
    sceneReadiness.resetScene();
    WarpIntro({ onComplete: () => completed++ });
    for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
    assert.equal(completed, 0);
    assert.equal([...timers.values()][0].at, INTRO_SAFETY_MS);
    now = INTRO_SAFETY_MS;
    const safety = [...timers.values()][0]; timers.clear(); safety.callback();
    assert.equal(completed, 0);
    assert.equal([...timers.values()][0].at, INTRO_SAFETY_MS + INTRO_REDUCED_FADE_MS);
    now += INTRO_REDUCED_FADE_MS;
    const fade = [...timers.values()][0]; timers.clear(); fade.callback();
    assert.equal(completed, 1);
    sceneReadiness.mark('scene'); sceneReadiness.mark('frame'); assert.equal(completed, 1);
    for (const cleanup of cleanups) cleanup();
    assert.equal(preferences.size, 0); assert.equal(timers.size, 0);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
