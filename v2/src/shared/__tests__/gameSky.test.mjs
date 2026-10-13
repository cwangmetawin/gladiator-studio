// npm run test:unit; MUTATE_CONSTELLATION_GROUP=1 deliberately routes a second game into the first (red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { skyModuleUrls } from './skyModuleUrls.mjs';
import { motionModuleUrls } from './motionModuleUrls.mjs';
import { sceneLoadingModuleUrls } from './sceneLoadingModuleUrls.mjs';
import { sceneEffectsModuleUrls } from './sceneEffectsModuleUrls.mjs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const moduleUrl = src => {
  const js = ts.transpileModule(src, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText.replace(/from ['"](react(?:\/jsx-runtime)?|framer-motion|@babylonjs\/core\/[^'"]+)['"]/g,
    (_match, name) => `from '${pathToFileURL(require.resolve(name)).href}'`)
    .replace(/import ['"](@babylonjs\/core\/[^'"]+)['"]/g,
      (_match, name) => `import '${pathToFileURL(require.resolve(name)).href}'`);
  return `data:text/javascript;base64,${Buffer.from(js).toString('base64')}`;
};
const urls = skyModuleUrls(moduleUrl, source, { mutateGroup: process.env.MUTATE_CONSTELLATION_GROUP === '1' });
const { GAME_PALETTE, gameHash, gameAccent, gameSkyPosition, CONSTELLATION_RADIUS } = await import(urls.identity);
const { createConstellationStore, winBrightness, starOpacity, STARS_PER_CONSTELLATION,
  PHONE_STARS_PER_CONSTELLATION, MAX_CONSTELLATIONS, STAR_LIFETIME_MS, STAR_FADE_MS } = await import(urls.constellations);
const { createTrailModel, velocityStrength, TRAIL_DECAY_MS, PHONE_TRAIL_DECAY_MS } = await import(urls.trail);
const { createSkyStore, skyStore, SKY_TINT_MIX } = await import(urls.store);
const { selectDoors, placeDoor, overlaps, DESKTOP_DOOR_CAP, PHONE_DOOR_CAP } = await import(urls.doors);
const { createConstellationMeshes, installGameSky } = await import(urls.renderer);
const { catalogueFocusIndex, catalogueDisplayOrder, resolvePhoneCatalogueFocus, focusCatalogueCard } = await import(urls.focus);
const timeUrl = moduleUrl(source('../utils/frameTime.ts'));
const rtpUrl = moduleUrl(source('../utils/gameRtp.ts'));
const catalogueUrl = moduleUrl(source('../../api/gameData.ts')
  .replace("from '@/shared/utils/gameRtp'", `from '${rtpUrl}'`)
  .replace("import { GameDataResponseSchema } from './schemas';", 'const GameDataResponseSchema = { parse: value => value };')
  .replace("import { fetchCatalogueFromDb } from './catalogueDb';", 'const fetchCatalogueFromDb = async () => null;'));
const liveCatalogueUrl = moduleUrl(source('../../features/live-feed/liveCatalogue.ts')
  .replace("from '@/api/gameData'", `from '${catalogueUrl}'`));
const motionUrls = motionModuleUrls(moduleUrl, source, timeUrl);
const loadingUrls = sceneLoadingModuleUrls(moduleUrl, source);
const effectsUrls = sceneEffectsModuleUrls(moduleUrl, source, timeUrl, motionUrls, urls);
const transitionSoundUrl = moduleUrl(source('../audio/transitionSound.ts')
  .replace("from '@/shared/motion/tokens'", `from '${motionUrls.tokens}'`));
const { createTransitionStore } = await import(motionUrls.store);
const { transitionTimeline } = await import(motionUrls.tokens);
const { isSceneCovered, createRenderLoop } = await import(moduleUrl(source('../../features/starfield/renderLoop.ts')
  .replace("from '@/shared/utils/frameTime'", `from '${timeUrl}'`)));
const within = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} vs ${expected}`);
const groupFor = (store, name) => store.groups.find(group => group.gameName === name);

// Execute the homepage's actual camera block and constants, without its canvas textures.
async function homepageCamera(B, scene, width) {
  const original = source('../../features/starfield/StarfieldBackground.tsx');
  const start = original.indexOf('  const camera = new BABYLON.ArcRotateCamera(');
  const end = original.indexOf('  // ── Lighting', start);
  assert.ok(start >= 0 && end > start, 'homepage camera block must be present');
  const cameraBlock = original.slice(start, end);
  const eventUrl = moduleUrl(source('../utils/sceneEvents.ts'));
  const loopUrl = moduleUrl(source('../../features/starfield/renderLoop.ts')
    .replace("from '@/shared/utils/frameTime'", `from '${timeUrl}'`));
  const twinkleUrl = moduleUrl(source('../../features/starfield/starTwinkle.ts')
    .replace("from '@/shared/utils/frameTime'", `from '${timeUrl}'`));
  const wired = original
    .replace("from '@/shared/utils/sceneEvents'", `from '${eventUrl}'`)
    .replace("from '@/shared/utils/frameTime'", `from '${timeUrl}'`)
    .replace("from './renderLoop'", `from '${loopUrl}'`)
    .replace("from './starTwinkle'", `from '${twinkleUrl}'`)
    .replace("from '@/shared/motion/transitionStore'", `from '${motionUrls.store}'`)
    .replace("from '@/features/journey/journeyMotion'", `from '${motionUrls.journey}'`)
    .replace("from './cameraNarrative'", `from '${motionUrls.camera}'`)
    .replace("from './gameSkyRenderer'", `from '${urls.renderer}'`)
    .replace("from './skyStore'", `from '${urls.store}'`)
    .replace("from './sceneReadiness'", `from '${loadingUrls.readiness}'`)
    .replace("from './sceneEffects'", `from '${effectsUrls.effects}'`)
    .replace("from '@/shared/utils/preloadScene'", `from '${loadingUrls.preload}'`);
  const { probeHomeCamera } = await import(moduleUrl(`${wired}\n
    export const probeWidth = ${width};
    export function probeHomeCamera(BABYLON, scene) { ${cameraBlock}\n return camera; }
  `));
  return probeHomeCamera(B, scene);
}

function homepageObstacles(width, height, phone, hubY, bottomInset = 0) {
  const raw = phone ? [
    { left: 13, top: 128, right: width - 13, bottom: 468 }, // Compact identity, stats and actions.
    { left: 40, top: 175, right: width - 40, bottom: 315 }, // Logo.
    { left: 28, top: 330, right: width - 28, bottom: 382 }, // Stats.
    { left: 24, top: 398, right: width - 24, bottom: 466 }, // Primary actions; section nodes hide below 700px.
    { left: width - 70, top: height - 108 - bottomInset, right: width - 16, bottom: height - 54 - bottomInset }, // Floating menu.
  ] : [
    { left: width / 2 - 230, top: height * hubY - 180, right: width / 2 + 230, bottom: height * hubY + 180 },
    { left: width / 2 - 230, top: height * hubY - 150, right: width / 2 + 230, bottom: height * hubY + 115 },
    { left: width / 2 - 180, top: height * hubY + 128, right: width / 2 + 180, bottom: height * hubY + 180 },
    ...[[27, 25], [73, 23], [13, 49], [87, 47], [26, 72], [74, 70], [50, 81]].map(([x, y]) => ({
      left: width * x / 100 - 45, top: height * y / 100 - 40,
      right: width * x / 100 + 45, bottom: height * y / 100 + 40,
    })),
  ];
  const padding = phone ? 12 : 40;
  return [
    ...raw.map(rect => ({ left: rect.left - padding, top: rect.top - padding,
      right: rect.right + padding, bottom: rect.bottom + padding })),
    { left: 0, top: 0, right: width, bottom: 64 },
    { left: 0, top: height - 38 - bottomInset, right: width, bottom: height }, // Live ticker and home-indicator inset.
  ];
}

for (const [width, height, phone, minimum] of [[1440, 900, false, 3], [320, 640, true, 1]]) {
  test(`real homepage camera chooses usable constellation doors at ${width}×${height}`, async t => {
    const B = await import(moduleUrl(source('../babylon/babylonCore.ts')));
    const { NullEngine } = await import(pathToFileURL(require.resolve('@babylonjs/core/Engines/nullEngine.js')).href);
    const { lookupGame } = await import(liveCatalogueUrl);
    const { GLADIATOR_SLOTS, METAWIN_ORIGINALS } = await import(catalogueUrl);
    const catalogue = new Map([...GLADIATOR_SLOTS, ...METAWIN_ORIGINALS].map(game => [game.title.toLowerCase(), game.title]));
    const previousWindow = globalThis.window;
    globalThis.window = { innerWidth: width, innerHeight: height, devicePixelRatio: phone ? 3 : 1,
      addEventListener() {}, removeEventListener() {} };
    // Homepage phone hardware scaling reduces the drawing buffer, never the DOM viewport.
    const scale = phone ? 1.5 : 1;
    const engine = new NullEngine({ renderWidth: Math.floor(width / scale), renderHeight: Math.floor(height / scale) });
    if (phone) engine.setHardwareScalingLevel(1.5);
    const scene = new B.Scene(engine);
    try {
      const camera = await homepageCamera(B, scene, width);
      const homeAlpha = camera.alpha;
      const { initialTransition } = await import(motionUrls.transition);
      const { createCameraNarrative } = await import(motionUrls.camera);
      const idle = { ...initialTransition(), mode: phone ? 'phone' : 'desktop' };
      const narrative = createCameraNarrative({ read: () => ({ alpha: camera.alpha }),
        write: pose => { camera.alpha = pose.alpha; }, target: () => ({ alpha: homeAlpha }),
        journey: () => ({ progress: 0, count: 0 }), isPhone: () => phone });
      const stars = new B.Mesh('existingStars', scene);
      stars.setVerticesData('position', new Float32Array([0, 0, 160]));
      stars.setVerticesData('color', new Float32Array([1, 1, 1, 1]), true);
      stars.setIndices([0]);
      const nebula = new B.Layer('nebula', null, scene, true);
      const sky = createSkyStore();
      sky.configure(phone, false);
      let published = 0;
      sky.onFrame(() => { published++; });
      installGameSky(B, scene, stars, nebula, () => 0, sky);
      const socketNames = ['Dice Zero', 'Pump', 'Packs', 'Keno', 'Limbo Zero', 'Plinko', 'Candy Cash', 'Legend of Tartarus'];
      for (let i = 0; i < socketNames.length; i++) {
        const canonical = lookupGame(socketNames[i])?.title;
        assert.ok(canonical && catalogue.has(canonical.toLowerCase()), `${socketNames[i]} must match through the real alias path`);
        sky.addWin(canonical, 100 + i * 100);
      }
      scene.render(); await scene.whenReadyAsync(); scene.render();
      assert.equal(sky.constellations.count, 8);
      assert.equal(sky.ready, true);
      assert.ok(published > 0, 'idle hub publishes projected positions');
      for (const candidate of sky.projections) candidate.gameTitle = catalogue.get(candidate.constellation.key) ?? '';
      for (const [hubY, bottomInset] of phone ? [[0.3, 0], [0.3, 34]] : [[0.3, 0], [0.44, 0]]) {
        const obstacles = homepageObstacles(width, height, phone, hubY, bottomInset);
        sky.setLayout(width, height, phone, obstacles);
        const points = scene.getMeshByName('gameConstellationPoints');
        const occupied = sky.projections.filter(candidate => candidate.constellation.count > 0);
        let initialRects;
        camera.alpha = homeAlpha;
        for (const cameraSeconds of [0, 90]) {
          // Fresh live stars at the real idle camera's 90-second pose, without sleeping or expiring the fixture.
          narrative.update(idle, cameraSeconds * 1000, cameraSeconds);
          for (const reduced of [false, true]) {
            sky.configure(phone, reduced);
            scene.render();
            const chosen = [];
            selectDoors(sky.projections, obstacles, phone, chosen);
            if (!reduced) t.diagnostic(`${width}×${height}, hub=${hubY}, inset=${bottomInset}, camera=${cameraSeconds}s: ${chosen.length} usable doors`);
            assert.ok(chosen.length >= minimum, `expected at least ${minimum} usable doors, got ${chosen.length}`);
            assert.equal(occupied.filter(candidate => candidate.visible).length, 8, 'all eight anchors stay in the visible sky');
            const rects = occupied.map(candidate => ({ ...candidate.rect }));
            if (!initialRects) initialRects = rects;
            else assert.deepEqual(rects, initialRects, 'camera orbit and reduced motion keep the same patches');
            for (let i = 0; i < chosen.length; i++) {
              const rect = chosen[i].rect;
              assert.ok(rect.left >= 0 && rect.right <= width && rect.top >= 0 && rect.bottom <= height);
              for (const obstacle of obstacles) assert.equal(overlaps(rect, obstacle), false);
              for (let j = 0; j < i; j++) assert.equal(overlaps(rect, chosen[j].rect), false);
            }
            const vertices = points.getVerticesData('position');
            for (let i = 0; i < occupied.length; i++) {
              const pixel = B.Vector3.Project(B.Vector3.FromArray(vertices, i * 3), points.getWorldMatrix(),
                scene.getTransformMatrix(), camera.viewport.toGlobal(width, height));
              const rect = occupied[i].rect;
              assert.ok(Math.abs(pixel.x - (rect.left + rect.right) / 2) <= 18.1);
              assert.ok(Math.abs(pixel.y - (rect.top + rect.bottom) / 2) <= 18.1);
              assert.ok(pixel.z >= 0 && pixel.z <= 1, 'rendered star and projected door share the front-facing camera space');
            }
          }
        }
      }
      sky.setLayout(width, height, phone, [{ left: 0, top: 0, right: width, bottom: height }]);
      scene.render();
      assert.equal(sky.projections.some(candidate => candidate.visible), false, 'a fully blocked viewport never invents an unsafe fallback');
      assert.equal(scene.getMeshByName('gameConstellationPoints').isEnabled(), false);
    } finally {
      scene.dispose(); engine.dispose();
      if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    }
  });
}

test('hash → palette is stable, canonical and confined to the five brand accents', () => {
  assert.equal(gameHash('  To THE Top  '), gameHash('to the top'));
  assert.equal(gameHash('hello'), 1335831723); // Known FNV-1a fixture.
  const seen = new Set();
  for (let i = 0; i < 1000; i++) {
    const title = `Game ${i}`;
    const accent = gameAccent(title);
    assert.equal(accent, gameAccent(title));
    assert.ok(GAME_PALETTE.includes(accent));
    for (const channel of ['r', 'g', 'b']) assert.ok(accent[channel] >= 0 && accent[channel] <= 1);
    seen.add(accent.name);
  }
  assert.equal(seen.size, 5);
});

test('hash → sky position is stable and stays on the bounded front-facing shell', () => {
  for (let i = 0; i < 1000; i++) {
    const position = gameSkyPosition(`Game ${i}`);
    assert.deepEqual(position, gameSkyPosition(`  GAME ${i}  `));
    assert.ok(position.x >= -100 && position.x <= 100);
    assert.ok(position.y >= -70 && position.y <= 70);
    assert.ok(position.z >= 100 && position.z <= CONSTELLATION_RADIUS);
    within(Math.hypot(position.x, position.y, position.z), CONSTELLATION_RADIUS);
  }
  const out = { x: 0, y: 0, z: 0 };
  assert.equal(gameSkyPosition('Navigator', out), out, 'caller-owned positions are reused');
});

test('a win adds one bright star and each game retains only its newest capped stars', () => {
  const store = createConstellationStore();
  store.addWin('Navigator', 100, 0);
  const group = groupFor(store, 'Navigator');
  assert.equal(store.count, 1);
  assert.equal(group.count, 1);
  assert.equal(group.stars.find(star => star.active).brightness, winBrightness(100));
  for (let i = 1; i < 40; i++) store.addWin('Navigator', i, i * 10);
  assert.equal(group.count, STARS_PER_CONSTELLATION);
  assert.deepEqual(group.stars.filter(star => star.active).map(star => star.born).sort((a, b) => a - b),
    Array.from({ length: STARS_PER_CONSTELLATION }, (_, i) => (40 - STARS_PER_CONSTELLATION + i) * 10));
});

test('old stars fade by wall time, expire completely, and reduced motion holds them steady until expiry', () => {
  const store = createConstellationStore();
  store.addWin('Navigator', 1000, 0);
  const star = groupFor(store, 'Navigator').stars.find(star => star.active);
  const brightness = star.brightness;
  store.update(STAR_LIFETIME_MS - STAR_FADE_MS);
  within(star.alpha, brightness);
  store.update(STAR_LIFETIME_MS - STAR_FADE_MS / 2);
  within(star.alpha, brightness / 2);
  store.configure(false, true, STAR_LIFETIME_MS - 1);
  within(star.alpha, brightness);
  store.update(STAR_LIFETIME_MS);
  assert.equal(star.alpha, 0);
  assert.equal(store.count, 0);
  assert.equal(starOpacity(0, STAR_LIFETIME_MS - 1, true), 1);
});

test('brightness rises monotonically on the logarithmic amount scale and invalid amounts stay finite', () => {
  const amounts = [0, 1, 10, 100, 1000, 10000, 100000, 1000000];
  for (let i = 1; i < amounts.length; i++) assert.ok(winBrightness(amounts[i]) > winBrightness(amounts[i - 1]));
  assert.equal(winBrightness(-10), winBrightness(0));
  assert.equal(winBrightness(NaN), winBrightness(0));
  assert.equal(winBrightness(Infinity), winBrightness(0));
  assert.equal(winBrightness(1e12), 1);
});

test('one game never leaks into another constellation, including interleaved wins', () => {
  const store = createConstellationStore();
  store.addWin('Navigator', 100, 0);
  const first = groupFor(store, 'Navigator');
  const position = { ...first.position };
  store.addWin('To The Top', 10000, 10);
  store.addWin('Navigator', 200, 20);
  assert.equal(first.count, 2);
  assert.equal(groupFor(store, 'To The Top').count, 1);
  assert.deepEqual(first.position, position);
  assert.notDeepEqual(first.position, groupFor(store, 'To The Top').position);
  assert.equal(store.count, 2);
});

test('phone reconfiguration and later wins keep the six-star cap; group/star pools stay bounded', () => {
  const store = createConstellationStore();
  const groups = store.groups.slice();
  const stars = store.groups.map(group => group.stars.slice());
  for (let i = 0; i < 12; i++) store.addWin('Navigator', 100, i);
  store.configure(true, false, 12);
  assert.equal(groupFor(store, 'Navigator').count, PHONE_STARS_PER_CONSTELLATION);
  for (let i = 12; i < 100; i++) {
    store.addWin('Navigator', 100, i);
    assert.equal(groupFor(store, 'Navigator').count, PHONE_STARS_PER_CONSTELLATION);
  }
  for (let i = 0; i < 100; i++) store.addWin(`Game ${i}`, 100, 100 + i);
  assert.equal(store.count, MAX_CONSTELLATIONS);
  for (let i = 0; i < groups.length; i++) {
    assert.equal(store.groups[i], groups[i]);
    for (let j = 0; j < stars[i].length; j++) assert.equal(store.groups[i].stars[j], stars[i][j]);
  }
});

test('drag velocity writes shared strength and direction synchronously, before a frame runs', () => {
  const sky = createSkyStore(() => 100);
  const notifications = [];
  const dispose = sky.subscribe(() => notifications.push(sky.trail.state.strength));
  sky.beginDrag(0, 0);
  sky.moveDrag(60, 100);
  within(sky.trail.state.strength, 0.5);
  assert.equal(notifications.at(-1), 0.5);
  sky.moveDrag(-60, 200);
  assert.equal(sky.trail.state.direction, -1);
  assert.equal(sky.trail.state.strength, 1);
  assert.equal(velocityStrength(2400), 1);
  assert.equal(velocityStrength(NaN), 0);
  dispose();
});

test('release decays to zero with identical 30/60/120 Hz behaviour within 5%; phone tails are shorter', () => {
  for (const phone of [false, true]) {
    const duration = phone ? PHONE_TRAIL_DECAY_MS : TRAIL_DECAY_MS;
    for (const hz of [30, 60, 120]) {
      const trail = createTrailModel();
      trail.begin(0, 0); trail.move(120, 100); trail.release(100);
      let elapsed = 0;
      for (let frame = 1; frame <= Math.ceil(duration * hz / 1000); frame++) {
        elapsed = frame * 1000 / hz;
        const actual = trail.sample(100 + elapsed, phone);
        const expected = elapsed >= duration ? 0 : Math.exp(Math.log(0.01) * elapsed / duration);
        within(actual, expected, Math.max(1e-9, expected * 0.05));
      }
      assert.equal(trail.state.strength, 0);
    }
  }
  const trail = createTrailModel();
  trail.begin(0, 0); trail.move(120, 100);
  assert.ok(trail.sample(600) < 1, 'a stopped pointer decays even before pointerup');
  trail.move(240, 700, true);
  assert.equal(trail.sample(700, false, true), 0);
});

test('tint stays subtle and reduced motion switches it instantly with no trail or fade', () => {
  const sky = createSkyStore(() => 100);
  sky.focusGame('Navigator');
  assert.equal(sky.tint.r, 0.6);
  sky.advance(100, 1 / 60);
  assert.ok(sky.tint.r >= 0.6 * (1 - SKY_TINT_MIX) && sky.tint.r <= 0.6);
  sky.configure(false, true);
  sky.focusGame('To The Top');
  assert.equal(sky.gameName, 'To The Top');
  assert.equal(sky.tint.r, sky.tint.targetR);
  assert.equal(sky.tint.g, sky.tint.targetG);
  assert.equal(sky.tint.b, sky.tint.targetB);
  sky.beginDrag(0, 0); sky.moveDrag(120, 100);
  assert.equal(sky.trail.state.strength, 0);
});

function candidate(name, brightness, x) {
  return { constellation: { gameName: name, count: 2, brightness }, gameTitle: name, visible: true,
    rect: { left: x, top: 100, right: x + 100, bottom: 144 } };
}

test('doors choose the top six by brightness, cap phones at three, and reuse the output pool', () => {
  const candidates = [2, 5, 1, 7, 3, 6, 4, 8].map((brightness, i) => candidate(`Game ${brightness}`, brightness, i * 200));
  const out = [];
  selectDoors(candidates, [], false, out);
  assert.equal(out.length, DESKTOP_DOOR_CAP);
  assert.deepEqual(out.map(door => door.constellation.brightness), [8, 7, 6, 5, 4, 3]);
  selectDoors(candidates, [], true, out);
  assert.equal(out.length, PHONE_DOOR_CAP);
  assert.deepEqual(out.map(door => door.constellation.brightness), [8, 7, 6]);
});

test('doors skip logo/hub collisions, each other, unavailable titles, and offscreen positions at 320 px', () => {
  const candidates = [candidate('Logo overlap', 10, 0), candidate('Clear', 9, 200),
    candidate('Door overlap', 8, 210), candidate('Another', 7, 400), candidate('Unavailable', 20, 600)];
  candidates[4].gameTitle = '';
  const logo = { left: 50, top: 90, right: 160, bottom: 180 };
  const out = [];
  selectDoors(candidates, [logo], false, out);
  assert.deepEqual(out.map(door => door.gameTitle), ['Clear', 'Another']);
  assert.equal(overlaps(candidates[0].rect, logo), true);
  const rect = {};
  assert.equal(placeDoor(rect, 160, 150, 320, 640, true), true);
  assert.ok(rect.left >= 0 && rect.right <= 320);
  assert.equal(placeDoor(rect, 20, 150, 320, 640, true), false);
  assert.equal(placeDoor(rect, 160, 20, 320, 640, true), false);
  assert.equal(placeDoor(rect, 160, 630, 320, 640, true), false);
});

const games = ['First', 'Navigator', 'To The Top'].map((title, id) => ({
  id, title, slug: title.toLowerCase().replaceAll(' ', '-'), category: 'slot',
  description: '', timeline: '2026', link: 'https://example.com',
}));

test('focus-game uses the ordinary transition and resolves the right active index after arrival or loading', () => {
  for (const mode of ['desktop', 'phone', 'reduced']) {
    let now = 100;
    const timers = [];
    const store = createTransitionStore({ now: () => now,
      schedule: (callback, delay) => { const timer = { callback, at: now + delay }; timers.push(timer); return timer; },
      cancel: timer => { if (timer) timer.cancelled = true; },
    });
    store.configure(mode);
    store.focusGame('  To The Top  ');
    assert.equal(store.getSnapshot().target, 'games');
    assert.equal(store.getSnapshot().focusGame, 'To The Top');
    assert.equal(catalogueFocusIndex([], store.getSnapshot().focusGame), -1);
    assert.equal(catalogueFocusIndex(games, store.getSnapshot().focusGame), 2);
    const timeline = transitionTimeline(mode, 'open');
    assert.equal(store.getSnapshot().panel, timeline.panelAtMs === 0 ? 'games' : 'none');
    while (store.getSnapshot().phase !== 'open') {
      const timer = timers.find(timer => !timer.cancelled && !timer.fired);
      timer.fired = true; now = timer.at; timer.callback();
    }
    assert.equal(store.getSnapshot().panel, 'games');
    store.focusGame('Navigator');
    assert.equal(store.getSnapshot().phase, 'open', 'retargeting an open catalogue needs no second flight');
    assert.equal(catalogueFocusIndex(games, store.getSnapshot().focusGame), 1);
    store.request('about');
    assert.equal(store.getSnapshot().focusGame, null);
  }
  assert.equal(catalogueFocusIndex(games, 'to-the-top'), 2);
  assert.equal(catalogueFocusIndex(games, 'unknown'), -1);
});

test('phone focus resolves the displayed index and keeps or changes the tab that holds the game', () => {
  const slots = [
    { ...games[0], title: 'Old Slot', slug: 'old-slot', timeline: '2023-01-01' },
    { ...games[1], title: 'New Slot', slug: 'new-slot', timeline: '2026-01-01', isHot: true },
    { ...games[2], title: 'Middle Slot', slug: 'middle-slot', timeline: '2025-01-01' },
  ];
  const originals = [
    { ...games[0], id: 100, title: 'Old Original', slug: 'old-original', category: 'mini', timeline: '2024-01-01' },
    { ...games[1], id: 101, title: 'New Original', slug: 'new-original', category: 'mini', timeline: '2026-06-01', isHot: true },
  ];
  assert.deepEqual(catalogueDisplayOrder(slots).map(game => game.title), ['New Slot', 'Middle Slot', 'Old Slot']);
  assert.deepEqual(resolvePhoneCatalogueFocus(slots, originals, 'mini', '  MIDDLE SLOT '),
    { tab: 'slot', index: 1, key: 'middle slot' });
  assert.deepEqual(resolvePhoneCatalogueFocus(slots, originals, 'slot', 'new-original'),
    { tab: 'mini', index: 0, key: 'new original' });
  assert.deepEqual(resolvePhoneCatalogueFocus(slots, originals, 'new', 'New Slot'),
    { tab: 'new', index: 1, key: 'new slot' });
  assert.deepEqual(resolvePhoneCatalogueFocus(slots, originals, 'new', 'Old Original'),
    { tab: 'mini', index: 1, key: 'old original' });
  assert.equal(resolvePhoneCatalogueFocus([], [], 'slot', 'New Original'), null, 'wait for loading data');
  assert.equal(resolvePhoneCatalogueFocus(slots, originals, 'slot', 'Missing'), null);
  assert.equal(resolvePhoneCatalogueFocus(slots, originals, 'slot', null), null);
  const tied = [slots[1], { ...slots[2], timeline: slots[1].timeline }];
  assert.deepEqual(catalogueDisplayOrder(tied), tied, 'same-date titles retain main’s spotlight / stable ordering');
});

test('phone card focus matches stable keys and scrolls instantly for reduced motion, smoothly otherwise', () => {
  const actions = [];
  const card = { dataset: { gameKey: "captain's prize" },
    scrollIntoView: options => actions.push(['scroll', options]), focus: options => actions.push(['focus', options]) };
  const root = { querySelectorAll(selector) {
    assert.equal(selector, '[data-game-key]', 'title punctuation never enters a selector');
    return [{ dataset: { gameKey: 'other game' } }, card];
  } };
  for (const reduced of [false, true]) {
    actions.length = 0;
    assert.equal(focusCatalogueCard(root, "captain's prize", reduced), true);
    assert.deepEqual(actions, [
      ['scroll', { behavior: reduced ? 'instant' : 'smooth', block: 'center', inline: 'nearest' }],
      ['focus', { preventScroll: true }],
    ]);
  }
  actions.length = 0;
  assert.equal(focusCatalogueCard(root, 'missing', false), false);
  assert.equal(focusCatalogueCard(null, 'missing', false), false);
  assert.deepEqual(actions, []);
});

const visualUrl = moduleUrl(`
  export function Reveal({ children }) { return children; }
  export function X() { return null; }
  export const ChevronLeft = X, ChevronRight = X, Play = X, LayoutGrid = X, Layers = X;
`);
const soundUrl = moduleUrl('export const soundEngine = { click() {}, transmission() {}, alert() {}, bigWin() {}, catalogueFocus() {} };');
const contextUrl = moduleUrl(source('../motion/panelMotion.ts'));
function coverflowSource() {
  return source('../../features/games/GameCoverflow.tsx').replace("import './coverflow.css';", '')
    .replace("from '@/shared/motion/tokens'", `from '${motionUrls.tokens}'`)
    .replace("from '@/shared/motion/panelMotion'", `from '${contextUrl}'`)
    .replace("from '@/shared/ui/Reveal'", `from '${visualUrl}'`)
    .replace("from 'lucide-react'", `from '${visualUrl}'`)
    .replace("from '@/shared/utils/soundEngine'", `from '${soundUrl}'`)
    .replace("from '@/shared/audio/transitionSound'", `from '${transitionSoundUrl}'`)
    .replace("from '@/features/starfield/skyStore'", `from '${urls.store}'`)
    .replace("from './catalogueFocus'", `from '${urls.focus}'`);
}

test('the shipped phone showcase waits for data, switches tabs before focusing, then permits manual tab changes', async () => {
  const hooksUrl = moduleUrl(`
    export const values = [], refs = [], effects = [];
    let stateIndex = 0, refIndex = 0;
    export function beginRender() { stateIndex = refIndex = 0; effects.length = 0; }
    export function useState(initial) { const i = stateIndex++;
      if (i >= values.length) values.push(typeof initial === 'function' ? initial() : initial);
      return [values[i], next => { values[i] = typeof next === 'function' ? next(values[i]) : next; }]; }
    export function useRef(current) { const i = refIndex++; if (i >= refs.length) refs.push({ current }); return refs[i]; }
    export const useEffect = fn => effects.push(fn), useMemo = fn => fn(), useCallback = fn => fn;
  `);
  const uiUrl = moduleUrl(`
    export function SectionWrapper({ children }) { return children; }
    export const SectionHeading = () => null, GameCard = () => null, FeaturedCard = () => null;
  `);
  const { GameShowcase } = await import(moduleUrl(source('../../features/games/GameShowcase.tsx')
    .replace("from 'react'", `from '${hooksUrl}'`)
    .replace("from '@/shared/components/SectionWrapper'", `from '${uiUrl}'`)
    .replace("from '@/shared/ui'", `from '${uiUrl}'`)
    .replace("from '@/shared/utils/soundEngine'", `from '${soundUrl}'`)
    .replace("from './GameCard'", `from '${uiUrl}'`)
    .replace("from './catalogueFocus'", `from '${urls.focus}'`)));
  const { beginRender, values, effects } = await import(hooksUrl);
  const previousDocument = globalThis.document;
  const actions = [];
  const original = { ...games[1], id: 100, category: 'mini', title: 'Original Focus', slug: 'original-focus' };
  const card = { dataset: { gameKey: 'original focus' }, scrollIntoView: options => actions.push(['scroll', options]),
    focus: options => actions.push(['focus', options]) };
  globalThis.document = { getElementById(id) {
    assert.equal(id, 'games'); actions.push(['query']); return { querySelectorAll: () => [card] };
  } };
  const render = props => { beginRender(); GameShowcase(props); for (const effect of effects) effect(); };
  try {
    render({ slotGames: [], miniGames: [], loading: true, focusGame: 'original-focus' });
    assert.equal(values[0], 'slot');
    assert.deepEqual(actions, []);
    const loaded = { slotGames: games, miniGames: [original], loading: false, focusGame: 'original-focus', reducedMotion: true };
    render(loaded);
    assert.equal(values[0], 'mini');
    assert.deepEqual(actions, [], 'tab commit precedes lookup / scrolling');
    render(loaded);
    assert.equal(actions[1][1].behavior, 'instant');
    assert.deepEqual(actions[2], ['focus', { preventScroll: true }]);
    actions.length = 0;
    values[0] = 'new'; render(loaded);
    assert.equal(values[0], 'new', 'a completed focus request does not force the user back');
    assert.deepEqual(actions, []);
  } finally {
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
});

test('both shipped phone card types expose the stable focus key and remain keyboard focusable', async () => {
  const cardUrl = moduleUrl(source('../../features/games/GameCard.tsx')
    .replace("from '@/shared/utils/soundEngine'", `from '${soundUrl}'`)
    .replace("from '@/features/starfield/gameIdentity'", `from '${urls.identity}'`));
  const { GameCard, FeaturedCard } = await import(cardUrl);
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  for (const component of [GameCard, FeaturedCard]) {
    const html = renderToStaticMarkup(React.createElement(component, { game: games[2], onPlayGame() {} }));
    assert.match(html, /role="button" tabindex="0"/);
    assert.match(html, /data-game-key="to the top"/);
  }
});

test('the shipped catalogue opens with the requested centre card; doors are real named buttons', async () => {
  const dialogUrl = moduleUrl(`import { useRef } from 'react'; export function useDialogFocus() { return useRef(null); }`);
  const { GameCoverflow } = await import(moduleUrl(coverflowSource()
    .replace("from '@/shared/hooks/useDialogFocus'", `from '${dialogUrl}'`)));
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const { initialTransition } = await import(motionUrls.transition);
  const html = renderToStaticMarkup(React.createElement(GameCoverflow, { games, loading: false, suspended: false,
    onClose() {}, returnFocusRef: { current: null }, narrative: { ...initialTransition('reduced'), focusGame: 'To The Top' } }));
  assert.match(html, /data-active-game="To The Top"/);
  assert.match(html, /data-active-index="2"/);
  assert.match(html, /class="deck-card is-centre"[^>]*aria-label="Play To The Top"/);
  const { ConstellationDoors } = await import(moduleUrl(source('../../features/starfield/ConstellationDoors.tsx')
    .replace("import './constellations.css';", '')
    .replace("from './gameIdentity'", `from '${urls.identity}'`)
    .replace("from './skyStore'", `from '${urls.store}'`)
    .replace("from './doorSelection'", `from '${urls.doors}'`)
    .replace("from './constellationStore'", `from '${urls.constellations}'`)));
  const doorsHtml = renderToStaticMarkup(React.createElement(ConstellationDoors, { active: true, phone: false, games, onFocusGame() {} }));
  assert.equal((doorsHtml.match(/<button type="button" class="constellation"/g) ?? []).length, DESKTOP_DOOR_CAP);
  assert.match(doorsHtml, /aria-label="Recent win constellations"/);
  assert.match(doorsHtml, /data-game=""/);
});

test('the real carousel pointermove updates trail/tint synchronously and release selects the previewed index', async () => {
  const hooksUrl = moduleUrl(`
    export const values = [];
    export function useState(initial) { const i = values.length; values.push(typeof initial === 'function' ? initial() : initial);
      return [values[i], next => { values[i] = typeof next === 'function' ? next(values[i]) : next; }]; }
    export const useRef = current => ({ current }), useId = () => 'catalogue';
    export const useEffect = () => {}, useLayoutEffect = () => {}, useCallback = fn => fn, useMemo = fn => fn();
  `);
  const frameUrl = moduleUrl(`export const motion = { div: 'div', button: 'button' }; export const useIsPresent = () => true;`);
  const dialogUrl = moduleUrl(`export function useDialogFocus() { return { current: null }; }`);
  const { values } = await import(hooksUrl);
  const { GameCoverflow } = await import(moduleUrl(coverflowSource().replace("from 'react'", `from '${hooksUrl}'`)
    .replace("from 'framer-motion'", `from '${frameUrl}'`)
    .replace("from '@/shared/hooks/useDialogFocus'", `from '${dialogUrl}'`)));
  const { initialTransition } = await import(motionUrls.transition);
  skyStore.configure(false, false);
  const tree = GameCoverflow({ games, loading: false, suspended: false, onClose() {}, returnFocusRef: { current: null },
    narrative: { ...initialTransition(), focusGame: 'To The Top' } });
  const panel = tree.props.children;
  const deck = panel.props.children.find(child => child?.props?.className?.includes('coverflow__deck'));
  const captured = new Set();
  deck.props.ref.current = { style: {}, setPointerCapture: id => captured.add(id),
    hasPointerCapture: id => captured.has(id), releasePointerCapture: id => captured.delete(id) };
  const pointer = { button: 0, isPrimary: true, pointerId: 1, clientX: 100, timeStamp: 0 };
  deck.props.onPointerDown(pointer);
  deck.props.onPointerMove({ ...pointer, clientX: 250, timeStamp: 100 });
  assert.equal(skyStore.trail.state.strength, 1);
  assert.equal(skyStore.gameName, 'Navigator');
  assert.equal(skyStore.trail.state.dragging, true);
  deck.props.onPointerUp({ ...pointer, clientX: 250, timeStamp: 110 });
  assert.equal(values[0], 1);
  assert.equal(skyStore.trail.state.dragging, false);
  assert.equal(captured.size, 0);
});

test('the shipped feeder emits a constellation win for both small and large tracked wins', async () => {
  const eventUrl = moduleUrl(source('../utils/sceneEvents.ts'));
  const { sceneEvents } = await import(eventUrl);
  const hooksUrl = moduleUrl(`
    export const handlers = [];
    export const useState = initial => [initial, () => {}], useRef = current => ({ current }), useEffect = () => {};
    export function useCallback(fn) { handlers.push(fn); return fn; }
  `);
  const socketUrl = moduleUrl('export const io = () => {};');
  const providerUrl = moduleUrl("export const classifyProvider = () => 'gladiator';");
  const { useFeederSocket } = await import(moduleUrl(source('../../features/live-feed/useFeederSocket.ts')
    .replace("from 'react'", `from '${hooksUrl}'`)
    .replace("from 'socket.io-client'", `from '${socketUrl}'`)
    .replace("from '@/shared/utils/sceneEvents'", `from '${eventUrl}'`)
    .replace("from '@/shared/utils/soundEngine'", `from '${soundUrl}'`)
    .replace("from './liveCatalogue'", `from '${providerUrl}'`)));
  const { handlers } = await import(hooksUrl);
  const wins = [];
  const dispose = sceneEvents.onWin(win => wins.push(win));
  useFeederSocket();
  for (const amount of [25, 1000]) handlers[0]({ type: 'GlobeActivity',
    payload: { game: { name: 'Navigator' }, win: { baseAmount: amount }, location: { lat: 1, lng: 2 } } });
  assert.deepEqual(wins.map(win => [win.gameName, win.amount]), [['Navigator', 25], ['Navigator', 1000]]);
  dispose();
});

test('desktop Games keeps rendering while every phone panel and opaque overlay retain M1 suspension', () => {
  assert.equal(isSceneCovered(false, false, false, 'games'), false);
  for (const phone of [false, true]) {
    assert.equal(isSceneCovered(false, false, phone, 'none'), false);
    assert.equal(isSceneCovered(true, false, phone, 'games'), true);
    assert.equal(isSceneCovered(false, true, phone, 'none'), true);
  }
  for (const panel of ['games', 'about', 'team', 'journey', 'live', 'careers', 'contact']) {
    assert.equal(isSceneCovered(false, false, true, panel), true);
  }
  let covered = false;
  let render;
  let frames = 0;
  const loop = createRenderLoop({ getState: () => ({ reducedMotion: false, hidden: false, suspended: covered }),
    getDeltaTime: () => 1000 / 60, render: () => { frames++; }, start: fn => { render = fn; }, stop() {} });
  loop.startLoop(); render();
  covered = isSceneCovered(false, false, true, 'games'); loop.startLoop();
  const frozen = frames;
  for (let i = 0; i < 10; i++) render();
  assert.equal(frames, frozen, 'no queued frame renders behind an opaque overlay');
  loop.dispose();
});

test('the app-root binding exposes trail/tint/constellation attributes synchronously and cleans up its listeners', async () => {
  const hooksUrl = moduleUrl(`
    export const root = { current: null }, effects = [], layouts = [];
    export const useRef = () => root, useEffect = fn => effects.push(fn), useLayoutEffect = fn => layouts.push(fn);
  `);
  const eventUrl = moduleUrl(source('../utils/sceneEvents.ts'));
  const { sceneEvents } = await import(eventUrl);
  const { root, effects, layouts } = await import(hooksUrl);
  const { useGameSky } = await import(moduleUrl(source('../../features/starfield/useGameSky.ts')
    .replace("from 'react'", `from '${hooksUrl}'`)
    .replace("from '@/shared/utils/sceneEvents'", `from '${eventUrl}'`)
    .replace("from '@/features/live-feed/liveCatalogue'", `from '${liveCatalogueUrl}'`)
    .replace("from './skyStore'", `from '${urls.store}'`)
    .replace("from './constellationStore'", `from '${urls.constellations}'`)));
  const previousWindow = globalThis.window;
  let maintained;
  globalThis.window = { setInterval: callback => { maintained = callback; return 1; }, clearInterval() {} };
  const cleanups = [];
  try {
    root.current = { dataset: {} };
    assert.equal(useGameSky(true, false, false), root);
    for (const layout of layouts) { const cleanup = layout(); if (cleanup) cleanups.push(cleanup); }
    for (const effect of effects) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
    skyStore.beginDrag(0, 0); skyStore.moveDrag(60, 100);
    assert.equal(root.current.dataset.trail, '0.50');
    skyStore.focusGame('To The Top');
    assert.equal(root.current.dataset.skyGame, 'To The Top');
    sceneEvents.emitWin({ gameName: 'Aviator', amount: 100, lat: 0, lng: 0 });
    sceneEvents.emitWin({ gameName: 'Navigator', amount: 200, lat: 0, lng: 0 });
    assert.equal(root.current.dataset.constellations, '1');
    assert.equal(groupFor(skyStore.constellations, 'Navigator').count, 2, 'real socket aliases share the catalogue constellation');
    for (const [socketName, title] of [['Dice Zero', 'Dice'], ['Pump', 'Pump'], ['Packs', 'Packs'], ['Keno', 'Keno'],
      ['Limbo Zero', 'Limbo'], ['Plinko', 'Plinko'], ['Candy Cash', 'Candy Cash'], ['Legend of Tartarus', 'Legend of Tartarus']]) {
      sceneEvents.emitWin({ gameName: socketName, amount: 100, lat: 0, lng: 0 });
      assert.equal(groupFor(skyStore.constellations, title)?.count, 1, `${socketName} resolves through the mounted socket binding`);
    }
    assert.equal(root.current.dataset.constellations, '9');
    assert.equal(typeof maintained, 'function');
    skyStore.releaseDrag(100); skyStore.advance(1000, 1 / 60); skyStore.publishFrame();
    assert.equal(root.current.dataset.trail, '0.00');
    for (const cleanup of cleanups) cleanup();
    cleanups.length = 0;
    sceneEvents.emitWin({ gameName: 'To The Top', amount: 100, lat: 0, lng: 0 });
    assert.equal(root.current.dataset.constellations, '9', 'unmounted root binding stays unsubscribed');
  } finally {
    for (const cleanup of cleanups) cleanup();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
});

test('projected DOM doors receive accessible names, activate the correct title, and avoid layout reads on frames', async () => {
  const hooksUrl = moduleUrl(`
    export const root = { current: null }, layouts = [];
    export const useRef = () => root, useLayoutEffect = fn => layouts.push(fn);
  `);
  const { root, layouts } = await import(hooksUrl);
  const { ConstellationDoors } = await import(moduleUrl(source('../../features/starfield/ConstellationDoors.tsx')
    .replace("from 'react'", `from '${hooksUrl}'`)
    .replace("import './constellations.css';", '')
    .replace("from './gameIdentity'", `from '${urls.identity}'`)
    .replace("from './skyStore'", `from '${urls.store}'`)
    .replace("from './doorSelection'", `from '${urls.doors}'`)
    .replace("from './constellationStore'", `from '${urls.constellations}'`)));
  const saved = Object.fromEntries(['window', 'document', 'ResizeObserver', 'MutationObserver'].map(name => [name, globalThis[name]]));
  let reads = 0;
  let requested;
  let onShellMutation;
  const obstacle = { getBoundingClientRect() { reads++; return { left: 1180, right: 1190, top: 100, bottom: 140 }; } };
  const buttons = Array.from({ length: 6 }, () => {
    const title = { textContent: '' }, count = { textContent: '' };
    return { hidden: true, dataset: {}, style: { setProperty() {} }, attributes: {},
      querySelector: selector => selector.includes('__name') ? title : count,
      setAttribute(name, value) { this.attributes[name] = value; } };
  });
  globalThis.window = { innerWidth: 1280, innerHeight: 720, setTimeout: () => 1, clearTimeout() {}, addEventListener() {}, removeEventListener() {} };
  const elements = [obstacle];
  globalThis.document = { querySelectorAll: () => elements, getElementById: () => null };
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  globalThis.MutationObserver = class { constructor(callback) { onShellMutation = callback; } observe() {} disconnect() {} };
  const catalogue = Array.from({ length: 7 }, (_, i) => ({ title: `Door Game ${i}` }));
  let cleanup;
  try {
    skyStore.constellations.update(performance.now() + STAR_LIFETIME_MS + 1);
    for (let i = 0; i < catalogue.length; i++) skyStore.addWin(catalogue[i].title, 10 ** i);
    for (const projection of skyStore.projections) {
      const index = catalogue.findIndex(game => game.title === projection.constellation.gameName);
      projection.visible = index >= 0;
      if (index >= 0) Object.assign(projection.rect, { left: index * 175 + 10, right: index * 175 + 170, top: 100, bottom: 144 });
    }
    skyStore.setReady(true);
    root.current = { querySelectorAll: () => buttons, parentElement: {} };
    const tree = ConstellationDoors({ active: true, phone: false, games: catalogue, onFocusGame: title => { requested = title; } });
    cleanup = layouts[0]();
    assert.deepEqual(buttons.filter(button => !button.hidden).map(button => button.dataset.game),
      ['Door Game 5', 'Door Game 4', 'Door Game 3', 'Door Game 2', 'Door Game 1', 'Door Game 0']);
    assert.equal(buttons[0].attributes['aria-label'], 'Door Game 5, 1 recent win. Open game catalogue');
    assert.equal(buttons[0].style.left, '885px');
    tree.props.children[0].props.onClick({ currentTarget: buttons[0] });
    assert.equal(requested, 'Door Game 5');
    const revision = skyStore.layout.revision;
    const tickerRect = { left: 0, top: 590, right: 1280, bottom: 720 };
    elements.push({ getBoundingClientRect() { reads++; return tickerRect; } });
    onShellMutation();
    assert.ok(skyStore.layout.revision > revision, 'a ticker mounted after the first win invalidates the sky patches');
    for (const slot of skyStore.layout.slots) assert.equal(overlaps(slot, tickerRect), false);
    const measured = reads;
    for (let i = 0; i < 10; i++) skyStore.publishFrame();
    assert.equal(reads, measured, 'projection updates never force layout');
  } finally {
    cleanup?.(); skyStore.setReady(false);
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
    }
  }
});

test('Babylon batches every constellation into two meshes with reusable, updatable buffers and at most two added draws', async () => {
  const B = await import(moduleUrl(source('../babylon/babylonCore.ts')));
  const { NullEngine } = await import(pathToFileURL(require.resolve('@babylonjs/core/Engines/nullEngine.js')).href);
  const previousWindow = globalThis.window;
  globalThis.window = { innerWidth: 1280, innerHeight: 720, addEventListener() {}, removeEventListener() {} };
  const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720 });
  const scene = new B.Scene(engine);
  const draws = [];
  const draw = engine.drawElementsType;
  const drawArrays = engine.drawArraysType;
  engine.drawElementsType = function (...args) { draws.push(args[0]); return draw.apply(this, args); };
  engine.drawArraysType = function (...args) { draws.push(args[0]); return drawArrays.apply(this, args); };
  try {
    new B.ArcRotateCamera('camera', -Math.PI / 2, Math.PI / 2, 30, B.Vector3.Zero(), scene);
    const stars = new B.Mesh('existingStars', scene);
    stars.setVerticesData('position', new Float32Array([0, 0, 160]));
    stars.setVerticesData('color', new Float32Array([1, 1, 1, 1]), true);
    stars.setIndices([0]);
    const nebula = new B.Layer('nebula', null, scene, true);
    const sky = createSkyStore();
    installGameSky(B, scene, stars, nebula, () => 1 / 60, sky);
    assert.equal(scene.meshes.length, 3);
    const points = scene.getMeshByName('gameConstellationPoints');
    const lines = scene.getMeshByName('gameConstellationLines');
    for (const mesh of [points, lines]) {
      assert.equal(mesh.getVertexBuffer('position').isUpdatable(), true);
      assert.equal(mesh.getVertexBuffer('color').isUpdatable(), true);
    }
    const pointBuffer = points.getVertexBuffer('position');
    const lineBuffer = lines.getVertexBuffer('color');
    scene.render(); await scene.whenReadyAsync(); scene.render();
    const baseline = draws.length;
    draws.length = 0; scene.render();
    const baselineDraws = draws.length;
    assert.ok(baseline > 0);
    sky.addWin('Navigator', 100); sky.addWin('Navigator', 200);
    draws.length = 0; scene.render(); await scene.whenReadyAsync();
    draws.length = 0; scene.render();
    assert.equal(draws.length - baselineDraws, 2);
    assert.ok(points.getVerticesData('color').some((value, i) => i % 4 === 3 && value > 0));
    assert.ok(lines.getVerticesData('color').some((value, i) => i % 4 === 3 && value > 0));
    for (let i = 0; i < 300; i++) sky.addWin(`Game ${i % 40}`, i * 10);
    scene.render();
    assert.equal(scene.meshes.length, 3);
    assert.equal(points.getVertexBuffer('position'), pointBuffer);
    assert.equal(lines.getVertexBuffer('color'), lineBuffer);
    const desktopVertices = points.subMeshes[0].verticesCount;
    sky.configure(true, false); scene.render();
    assert.ok(points.subMeshes[0].verticesCount < desktopVertices);
    assert.ok(points.subMeshes[0].verticesCount <= MAX_CONSTELLATIONS * PHONE_STARS_PER_CONSTELLATION);
    assert.ok(lines.subMeshes[0].indexCount <= MAX_CONSTELLATIONS * (PHONE_STARS_PER_CONSTELLATION - 1) * 2);
    assert.equal(sky.ready, true);
    scene.dispose();
    assert.equal(sky.ready, false);
  } finally {
    scene.dispose(); engine.dispose();
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
  }
  assert.equal(typeof createConstellationMeshes, 'function');
});
