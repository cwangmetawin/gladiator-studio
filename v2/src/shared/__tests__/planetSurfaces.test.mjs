import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLoader } from './loadTs.mjs';
import { moduleUrl } from './sourceModule.mjs';

const { load } = createLoader();
const planets = ['journey', 'games', 'about', 'team', 'live', 'careers', 'contact'];
const source = () => readFileSync(new URL('../../features/starfield/StarfieldBackground.tsx', import.meta.url), 'utf8');

async function harness(canFly = () => true) {
  const { createPlanetSurfaces } = await load('features/starfield/planetSurfaces.ts');
  const calls = [], slots = new Map(), cancelled = [];
  let next = 0;
  const surfaces = createPlanetSurfaces({
    planets, canFly, load: id => calls.push(id),
    scheduleIdle(callback) {
      const id = ++next;
      slots.set(id, callback);
      return () => { cancelled.push(id); slots.delete(id); };
    },
  });
  const step = () => {
    assert.equal(slots.size, 1, 'only one idle callback may be pending');
    const [id, callback] = slots.entries().next().value;
    slots.delete(id);
    callback();
  };
  return { surfaces, calls, slots, cancelled, step };
}

test('a phone never requests a planet, including ready signals and camera flights', async () => {
  const h = await harness(() => false);
  h.surfaces.flight('about');
  h.surfaces.ready();
  for (const id of planets) h.surfaces.flight(id);
  h.surfaces.ready();
  assert.deepEqual(h.calls, []);
  assert.equal(h.slots.size, 0);
});

test('nothing loads before hand-off; each idle slot then requests one planet in order, once', async () => {
  const h = await harness();
  assert.deepEqual(h.calls, []);
  assert.equal(h.slots.size, 0);
  h.surfaces.ready(); h.surfaces.ready();
  assert.deepEqual(h.calls, [], 'ready schedules work instead of doing it in the hand-off task');
  for (let index = 0; index < planets.length; index++) {
    h.step();
    assert.deepEqual(h.calls, planets.slice(0, index + 1));
  }
  h.surfaces.ready();
  for (const id of planets) h.surfaces.flight(id);
  assert.equal(h.slots.size, 0);
  assert.deepEqual(h.calls, planets);
});

test('a flight requests its missing focal planet immediately and idle prefetch skips it', async () => {
  const h = await harness();
  h.surfaces.ready();
  h.surfaces.flight('about'); h.surfaces.flight('about');
  h.surfaces.flight('none'); h.surfaces.flight('cosmos');
  assert.deepEqual(h.calls, ['about']);
  while (h.slots.size) h.step();
  assert.deepEqual(h.calls, ['about', ...planets.filter(id => id !== 'about')]);
});

test('a flight before hand-off waits for readiness and preserves only the current focal planet', async () => {
  const h = await harness();
  h.surfaces.flight('about'); h.surfaces.flight('team');
  assert.deepEqual(h.calls, []);
  assert.equal(h.slots.size, 0);
  h.surfaces.ready();
  assert.deepEqual(h.calls, ['team']);
  h.step();
  assert.deepEqual(h.calls, ['team', 'journey']);
});

test('returning home before hand-off clears the queued flight', async () => {
  const h = await harness();
  h.surfaces.flight('about'); h.surfaces.flight('none');
  h.surfaces.ready();
  assert.deepEqual(h.calls, []);
  h.step();
  assert.deepEqual(h.calls, ['journey']);
});

test('a desktop resized to phone width cannot load from an already queued idle callback', async () => {
  let flies = true;
  const h = await harness(() => flies);
  h.surfaces.ready();
  flies = false;
  h.step();
  h.surfaces.flight('about');
  assert.deepEqual(h.calls, []);
  assert.equal(h.slots.size, 0);
});

test('dispose cancels idle work; stale callbacks, later readiness and flights stay silent', async () => {
  const h = await harness();
  h.surfaces.ready();
  const stale = [...h.slots.values()][0];
  h.surfaces.dispose(); h.surfaces.dispose();
  assert.equal(h.cancelled.length, 1);
  assert.equal(h.slots.size, 0);
  stale();
  h.surfaces.ready(); h.surfaces.flight('about');
  assert.deepEqual(h.calls, []);
  assert.equal(h.slots.size, 0);
});

test('dispose before readiness leaves no work to schedule', async () => {
  const h = await harness();
  h.surfaces.flight('about'); h.surfaces.dispose();
  h.surfaces.ready(); h.surfaces.flight('team');
  assert.deepEqual(h.calls, []);
  assert.equal(h.slots.size, 0);
});

test('the browser idle adapter uses a timeout and cancels the matching idle handle', async () => {
  const { schedulePlanetIdle } = await load('features/starfield/planetSurfaces.ts');
  const callback = () => {};
  let scheduled, cancelled;
  const cancel = schedulePlanetIdle({
    requestIdleCallback(fn, options) { scheduled = { fn, options }; return 17; },
    cancelIdleCallback(id) { cancelled = id; },
    setTimeout() { assert.fail('native idle scheduling is available'); },
    clearTimeout() { assert.fail('this is an idle handle'); },
  }, callback);
  assert.equal(scheduled.fn, callback);
  assert.ok(scheduled.options.timeout > 0 && scheduled.options.timeout <= 2000);
  cancel();
  assert.equal(cancelled, 17);
});

test('without requestIdleCallback the adapter schedules and cancels a later timer task', async () => {
  const { schedulePlanetIdle } = await load('features/starfield/planetSurfaces.ts');
  const callback = () => {};
  let scheduled, cancelled;
  const cancel = schedulePlanetIdle({
    setTimeout(fn, delay) { scheduled = { fn, delay }; return 23; },
    clearTimeout(id) { cancelled = id; },
  }, callback);
  assert.equal(scheduled.fn, callback);
  assert.ok(scheduled.delay > 0);
  cancel();
  assert.equal(cancelled, 23);
});

test('building the solar system creates tint materials without any surface or ring texture', () => {
  const builder = source().split('function buildSolarSystem(')[1]?.split('// ─── Main scene factory')[0];
  assert.ok(builder, 'the shipped solar-system builder exists');
  assert.doesNotMatch(builder, /new BABYLON\.(?:Dynamic)?Texture\s*\(/);
  assert.doesNotMatch(builder, /\bringTexture\s*\(/);
  assert.doesNotMatch(builder, /\btx\s*\(/, 'texture construction belongs to the deferred loader');
  assert.match(builder, /loadSurface:\s*\(\)\s*=>/);
});

test('the Earth surface loader uses both 2048 maps and leaves the original files available', () => {
  const text = source();
  for (const name of ['earth_day_2048.webp', 'earth_night_2048.webp']) {
    assert.ok(text.includes(name), `the shipped loader must use ${name}`);
    assert.ok(readFileSync(new URL(`../../../public/textures/${name}`, import.meta.url)).length > 0);
  }
  assert.doesNotMatch(text, /['"]earth_(?:day|night_2k)\.webp['"]/);
  for (const name of ['earth_day.webp', 'earth_night_2k.webp']) {
    assert.ok(readFileSync(new URL(`../../../public/textures/${name}`, import.meta.url)).length > 0);
  }
});

test('the real builder keeps the tint until a surface arrives, preserves Earth maps, and ignores disposed loads', async () => {
  const text = source();
  const section = text.slice(text.indexOf('interface NavPlanet {'), text.indexOf('// ─── Main scene factory'));
  const { buildSolarSystem } = await import(moduleUrl(`const perSecond = value => value;\n${section}\nexport { buildSolarSystem };`));
  const textures = [], rings = [];
  class Color3 {
    constructor(...rgb) { this.rgb = rgb; }
    static White() { return new Color3(1, 1, 1); }
    static Black() { return new Color3(0, 0, 0); }
  }
  class Vector3 {
    constructor(x, y, z) { Object.assign(this, { x, y, z }); }
    clone() { return new Vector3(this.x, this.y, this.z); }
  }
  class Texture {
    constructor(url) { this.url = url; textures.push(this); }
    isReady() { return false; }
    onLoadObservable = { addOnce: callback => { this.arrive = callback; } };
  }
  class DynamicTexture {
    constructor() { rings.push(this); }
    getContext() { return { clearRect() {}, beginPath() {}, arc() {}, stroke() {} }; }
    update() {}
  }
  const mesh = () => ({ rotation: {}, setEnabled(enabled) { this.enabled = enabled; } });
  const B = { Color3, Vector3, Texture, DynamicTexture, StandardMaterial: class {},
    MeshBuilder: { CreateSphere: mesh, CreatePlane: mesh }, Material: { MATERIAL_ALPHABLEND: 2 } };
  const scene = { isDisposed: false };
  let repaints = 0;
  const built = buildSolarSystem(B, scene, () => repaints++);
  assert.equal(textures.length, 0); assert.equal(rings.length, 0);
  const earth = built.find(planet => planet.panelId === 'about');
  const mat = earth.mesh.material;
  assert.deepEqual(mat.diffuseColor.rgb, [0.20, 0.42, 0.70]);
  earth.loadSurface();
  assert.deepEqual(textures.map(texture => texture.url.split('/').at(-1)), [
    'earth_day_2048.webp', 'earth_bump.webp', 'earth_specular.webp', 'earth_night_2048.webp',
  ]);
  assert.equal(mat.diffuseTexture, undefined, 'a pending texture must not hide the tint material');
  assert.deepEqual(mat.diffuseColor.rgb, [0.20, 0.42, 0.70]);
  assert.equal(mat.emissiveColor, undefined, 'the pending night map must not turn the fallback into a solid emissive sphere');
  assert.deepEqual(mat.specularColor.rgb, [0.06, 0.06, 0.08]);
  for (const texture of textures) texture.arrive();
  assert.deepEqual(mat.diffuseColor.rgb, [1, 1, 1]);
  assert.equal(mat.diffuseTexture, textures[0]);
  assert.equal(mat.bumpTexture, textures[1]); assert.equal(mat.bumpTexture.level, 0.35);
  assert.equal(mat.specularTexture, textures[2]);
  assert.equal(mat.emissiveTexture, textures[3]);
  assert.deepEqual(mat.specularColor.rgb, [0.25, 0.25, 0.25]);
  assert.deepEqual(mat.emissiveColor.rgb, [0.42, 0.38, 0.28]);
  assert.equal(repaints, 4, 'each arrived map can refresh a reduced-motion static frame');
  const saturn = built.find(planet => planet.panelId === 'games');
  assert.equal(saturn.ring.enabled, false, 'the untextured ring plane must not show as a square');
  saturn.loadSurface();
  assert.equal(rings.length, 1);
  assert.equal(saturn.ring.enabled, true);
  assert.equal(saturn.ring.material.diffuseTexture, rings[0]);
  const jupiter = built.find(planet => planet.panelId === 'journey');
  jupiter.loadSurface();
  const beforeDispose = textures.length, beforePaint = repaints;
  scene.isDisposed = true;
  textures.at(-1).arrive();
  built.find(planet => planet.panelId === 'team').loadSurface();
  assert.equal(textures.length, beforeDispose);
  assert.equal(repaints, beforePaint);
  assert.deepEqual(jupiter.mesh.material.diffuseColor.rgb, [0.80, 0.66, 0.46]);
  const cachedFrames = [];
  const cached = buildSolarSystem({ ...B, Texture: class extends Texture { isReady() { return true; } } },
    { isDisposed: false }, () => cachedFrames.push({ specular: cachedMat.specularColor?.rgb, emissive: cachedMat.emissiveColor?.rgb,
      hasSpecular: !!cachedMat.specularTexture, hasNight: !!cachedMat.emissiveTexture }));
  const cachedEarth = cached.find(planet => planet.panelId === 'about');
  const cachedMat = cachedEarth.mesh.material;
  cachedEarth.loadSurface();
  assert.equal(cachedFrames.length, 4);
  for (const frame of cachedFrames) {
    assert.deepEqual(frame.specular, frame.hasSpecular ? [0.25, 0.25, 0.25] : [0.06, 0.06, 0.08]);
    assert.deepEqual(frame.emissive, frame.hasNight ? [0.42, 0.38, 0.28] : undefined,
      'a cache hit may repaint synchronously, so each map must arrive together with its lighting colour');
  }
});

test('the shipped hand-off watcher waits for both home readiness and actual gate removal, then unsubscribes', async () => {
  const text = source();
  const start = text.indexOf('function watchPlanetHandoff(');
  const end = text.indexOf('\nfunction buildScene(', start);
  assert.ok(start >= 0 && end > start, 'the scene has a hand-off watcher');
  const { watchPlanetHandoff } = await import(moduleUrl(`${text.slice(start, end)}\nexport { watchPlanetHandoff };`));
  const previous = { document: globalThis.document, MutationObserver: globalThis.MutationObserver, sceneReadiness: globalThis.sceneReadiness };
  let milestone = 'frame', gate = true, checks, changed, stopped = 0, disconnected = 0, calls = 0;
  globalThis.sceneReadiness = { getSnapshot: () => milestone, subscribe(fn) { changed = fn; return () => stopped++; } };
  globalThis.document = { body: {}, querySelector: () => gate ? {} : null };
  globalThis.MutationObserver = class {
    constructor(fn) { checks = fn; }
    observe() {}
    disconnect() { disconnected++; }
  };
  try {
    const dispose = watchPlanetHandoff(() => calls++);
    milestone = 'home'; changed();
    assert.equal(calls, 0, 'home starts the gate fade, but the gate is still present');
    gate = false; checks();
    assert.equal(calls, 1);
    assert.equal(stopped, 1); assert.equal(disconnected, 1);
    changed(); checks(); dispose();
    assert.equal(calls, 1);
    milestone = 'frame'; gate = false;
    const late = watchPlanetHandoff(() => calls++);
    checks(); assert.equal(calls, 1, 'a safety-timeout gate exit still waits for the arena');
    milestone = 'home'; changed();
    assert.equal(calls, 2);
    late();
    milestone = 'frame';
    const cancelled = watchPlanetHandoff(() => calls++);
    cancelled(); milestone = 'home'; changed(); checks();
    assert.equal(calls, 2, 'a disposed scene cannot release surface work');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test('the gate warms only what the first screen shows: the nebula, and no planet surface', () => {
  const preload = readFileSync(new URL('../utils/preloadScene.ts', import.meta.url), 'utf8');
  const list = preload.split('const FIRST_VISIBLE = [')[1]?.split(']')[0];
  assert.ok(list, 'the shipped warm-up list exists');
  assert.match(list, /'\/nebula\.webp'/);
  assert.doesNotMatch(list, /\/textures\//, 'planet surfaces load after the hand-off (planetSurfaces), never on the gate');
});
