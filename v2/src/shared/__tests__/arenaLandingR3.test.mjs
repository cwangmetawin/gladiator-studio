import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Vector3, Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { Viewport } from '@babylonjs/core/Maths/math.viewport.js';
import { createLoader } from './loadTs.mjs';

const { load } = createLoader();
const B = await load('shared/babylon/babylonCore.ts'), A = await load('features/arena/arenaCore.ts');
const { createPageGates } = await load('features/arena/pageGates.ts');
const { colosseumLines, ARENA_CENTER } = await load('features/arena/colosseumGeometry.ts');
const { createPageGateMeshes } = await load('features/arena/pageGateMeshes.ts');
const { createPageFlightController } = await load('features/arena/pageFlightController.ts');
const { createPageTransitionStore } = await load('features/arena-page/pageTransitionStore.ts');
const css = readFileSync(new URL('../../features/arena-page/arenaPage.css', import.meta.url), 'utf8');
const topbar = readFileSync(new URL('../../features/arena/topBar.css', import.meta.url), 'utf8');
const metrics = JSON.parse(readFileSync(new URL('./sairaTitleMetrics.json', import.meta.url), 'utf8'));
assert.equal(createHash('sha256').update(readFileSync(new URL(`../../../${metrics.font}`, import.meta.url))).digest('hex'), metrics.sha256,
  'headline metrics must match the real preloaded Saira Title file');
const { ARENA_PAGE_COPY } = await load('features/arena-page/pageCopy.ts');
const partnerCopy = JSON.parse(readFileSync(new URL('../../api/partnerDefault.json', import.meta.url), 'utf8'));

function layoutBounds(width, height, page) {
  const rule = selector => css.slice(css.indexOf(`${selector} {`) + selector.length + 2).split('}')[0];
  const pad = rule('.partner').match(/--partner-pad: clamp\((\d+)px, ([\d.]+)vw, (\d+)px\)/);
  const inset = Math.min(Number(pad[3]), Math.max(Number(pad[1]), width * Number(pad[2]) / 100));
  const phone = width <= 767, partner = page === 'partner';
  assert.match(topbar, /height: calc\(56px \+ env\(safe-area-inset-top/);
  const bar = partner || width > 1000 ? 56 : width < 350 ? 146 : 102; // Upper bound, including wrapped navigation and hairlines.
  const top = phone ? 36 : Math.min(72, Math.max(36, height * 0.06));
  const available = width - inset * 2 - 16; // Reserve the widest stable scrollbar gutter.
  const emblem = phone ? Math.min(available * 0.55, 240) : Math.min(360, Math.max(180, width * 0.25));
  const maxEmblem = phone ? Math.min((width - inset * 2) * 0.55, 240) : emblem;
  const title = rule('.partner__title'), copy = partner ? partnerCopy : ARENA_PAGE_COPY[page];
  assert.match(title, /max-width: 1280px/);
  assert.match(title, /font-size: clamp\(96px, 8.6vw, 148px\)/);
  assert.match(css, /\.partner__title \{ font-size: clamp\(44px, 11.5vw, 80px\); line-height: 1.02; margin-block: 32px 24px/);
  assert.match(css, /\.partner__hero \{ padding-block: 36px 40px/);
  assert.match(css, /\.partner__hero\s*\{[^}]*justify-content: center/s);
  assert.match(css, /\.partner__identity[^}]*justify-content: space-between/);
  assert.match(title, /line-height: 0.98/); assert.match(title, /letter-spacing: -0.03em/);
  const size = phone ? Math.min(80, Math.max(44, width * 0.115)) : Math.min(148, Math.max(96, width * 0.086));
  const measure = text => [...text].reduce((sum, char) => sum + metrics.advances[char] / metrics.unitsPerEm * size - size * 0.03, 0);
  let lines = 1, line = '';
  // Balance preserves the line count. A 4% width reserve also covers kerning/fallback differences.
  for (const word of copy.title.toUpperCase().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > Math.min(1280, available) * 0.96) { lines++; line = word; } else line = next;
  }
  const titleHeight = lines * size * (phone ? 1.02 : 0.98), identity = maxEmblem * 237 / 935;
  const before = phone ? 32 : 28, after = 24, ledeMin = (phone ? 16 : Math.min(20, Math.max(16, width * 0.015))) * 1.8;
  const heroHeight = Math.max(height - 94, top + (phone ? 40 : top) + identity + before + titleHeight + after + ledeMin);
  // Actual CSS h1 inline box + a conservative block envelope from the flex layout and real
  // font advances. At least one lede line is present; more lines / partner stats move h1 up.
  const titleY = 56 + top + emblem * 237 / 935 + before;
  const titleBottom = Math.max(bar + heroHeight / 2 + (identity + before + titleHeight - after - ledeMin) / 2,
    bar + top + identity + before + titleHeight);
  const emblemBottom = Math.max(bar + top + identity,
    bar + (height - 94) / 2 + (identity - before - size * (phone ? 1.02 : 0.98) - after - ledeMin) / 2);
  const reveal = Number(css.match(/@keyframes partner-title-in \{ from \{ opacity: 0; transform: translateY\(([\d.]+)px\)/)?.[1]);
  assert.ok(Number.isFinite(reveal), 'include the actual title reveal transform in the protected box');
  return {
    headline: { x: inset, y: titleY, width: Math.min(1280, width - inset * 2), height: Math.max(0, titleBottom + reveal - titleY) },
    emblem: { x: width - inset - 16 - maxEmblem, y: 56 + top, width: maxEmblem + 16,
      height: Math.max(identity, emblemBottom - 56 - top) },
  };
}

function projectedBounds(mesh, camera, width, height) {
  mesh.computeWorldMatrix(true);
  const corners = mesh.getBoundingInfo().boundingBox.vectorsWorld;
  const view = camera.getViewMatrix(), local = corners.map(point => Vector3.TransformCoordinates(point, view));
  const clipped = local.filter(point => point.z >= camera.minZ);
  for (let i = 0; i < corners.length; i++) for (let j = i + 1; j < corners.length; j++) {
    if (['x', 'y', 'z'].filter(axis => corners[i][axis] !== corners[j][axis]).length !== 1) continue;
    const a = local[i], b = local[j];
    if ((a.z < camera.minZ) === (b.z < camera.minZ)) continue;
    clipped.push(Vector3.Lerp(a, b, (camera.minZ - a.z) / (b.z - a.z)));
  }
  if (!clipped.length) return null;
  const points = clipped.map(point => Vector3.Project(point, Matrix.Identity(), camera.getProjectionMatrix(), new Viewport(0, 0, width, height)));
  const x = Math.max(0, Math.min(...points.map(p => p.x))), y = Math.max(0, Math.min(...points.map(p => p.y)));
  const right = Math.min(width, Math.max(...points.map(p => p.x))), bottom = Math.min(height, Math.max(...points.map(p => p.y)));
  return right <= x || bottom <= y ? null : { x, y, width: right - x, height: bottom - y };
}
const overlaps = (a, b, margin) => a && a.x < b.x + b.width + margin && a.x + a.width > b.x - margin
  && a.y < b.y + b.height + margin && a.y + a.height > b.y - margin;

test('real gate bounds through every real resting camera clear the headline and emblem layout on four viewports', () => {
  let projections = 0;
  for (const [width, height] of [[1440, 900], [1280, 800], [390, 844], [320, 640]]) {
    const phone = width <= 767, engine = new NullEngine({ renderWidth: width, renderHeight: height, textureSize: 512 });
    const scene = new B.Scene(engine), camera = new A.FreeCamera('landing-proof', new B.Vector3(), scene);
    const gates = createPageGateMeshes(B, A, scene, phone);
    try {
      for (const gate of createPageGates(phone ? 40 : 64)) {
        const store = createPageTransitionStore(), controller = createPageFlightController(camera, phone, () => true, store, () => {});
        store.setAvailable(true); store.request(gate.id);
        assert.equal(store.getSnapshot().phase, 'settled');
        camera.getViewMatrix(true); camera.getProjectionMatrix(true);
        const boxes = layoutBounds(width, height, gate.id);
        for (const mesh of [...gates.meshes, ...(gates.names ?? [])]) {
          const projected = projectedBounds(mesh, camera, width, height);
          for (const [name, box] of Object.entries(boxes)) {
            assert.ok(!overlaps(projected, box, 12), `${width}x${height} ${gate.id}: ${mesh.name} overlaps ${name}: ${JSON.stringify({ projected, box })}`);
          }
          projections++;
        }
        const project = point => Vector3.Project(new B.Vector3(...point), Matrix.Identity(), camera.getTransformationMatrix(), new Viewport(0, 0, width, height));
        const visible = point => point.z > 0 && point.z < 1 && point.x >= 0 && point.x <= width && point.y >= 56 && point.y <= height;
        const arcade = colosseumLines(phone ? 40 : 64).filter(line => line.kind === 'arcade').flatMap(line => line.points.map(project)).filter(visible);
        assert.ok(arcade.length > 20, 'clearance must keep real arcade geometry in view');
        assert.ok(Math.max(...arcade.map(p => p.y)) - Math.min(...arcade.map(p => p.y)) > height * 0.15,
          'the two-tier arena still has depth in the composition');
        const sand = Array.from({ length: 128 }, (_, i) => {
          const angle = i / 128 * Math.PI * 2;
          return project([ARENA_CENTER[0] + Math.cos(angle) * 11.5, ARENA_CENTER[1], ARENA_CENTER[2] + Math.sin(angle) * 11.5]);
        }).filter(visible);
        assert.ok(sand.length > 2, `${width}x${height} ${gate.id}: the lit sand must stay in view`);
        controller.dispose();
      }
    } finally { gates.dispose(); scene.dispose(); engine.dispose(); }
  }
  console.log(`landing clearance: ${projections} real gate projections; 12px margin; CSS wrapping envelopes`);
});

test('gate names fade before the body appears, stay absent on scroll, return for switches/close, and warm/dispose with the arches', async () => {
  const engine = new NullEngine(), scene = new B.Scene(engine), camera = new A.FreeCamera('name-proof', new B.Vector3(0, 2, 32), scene);
  const gates = createPageGateMeshes(B, A, scene, false), store = createPageTransitionStore();
  const controller = createPageFlightController(camera, false, () => false, store, () => {});
  try {
    const names = scene.meshes.filter(mesh => mesh.name.startsWith('arenaPageGateName-'));
    assert.equal(names.length, 8, 'baked Saira lettering has its own visibility, without replacing the portal');
    assert.ok(names.every(mesh => mesh.material === gates.meshes[0].material), 'no new material variant');
    assert.equal(scene.textures.length, 0);
    assert.ok(names.every(mesh => gates.warmMeshes.includes(mesh)), 'all name draws join the existing warm set');
    const counts = scene.meshes.map(mesh => mesh.getTotalVertices());
    const paint = () => gates.update(1, store.getSnapshot().targetPage ?? undefined, controller.gateNames());
    store.setAvailable(true); store.request('about');
    controller.step(0.6); paint(); assert.ok(names.every(mesh => mesh.visibility > 0.9), 'names belong to flights');
    controller.step(0.58); paint();
    assert.ok(names.every(mesh => mesh.visibility > 0 && mesh.visibility < 0.9), 'names actually fade before landing');
    controller.step(0.1); paint();
    assert.equal(store.getSnapshot().phase, 'settled');
    assert.ok(names.every(mesh => mesh.visibility === 0), 'no name is left behind visible copy');
    assert.ok(gates.meshes.every(mesh => mesh.isVisible && mesh.visibility === 1), 'the lit architecture stays');
    store.setScroll(1); controller.step(0.5); paint(); assert.ok(names.every(mesh => mesh.visibility === 0));
    store.request('team'); paint(); assert.ok(names.every(mesh => mesh.visibility === 0), 'switch starts without a name flash');
    controller.step(0.2); paint(); assert.ok(names.every(mesh => mesh.visibility > 0.9));
    store.request(null); controller.step(2); paint();
    assert.equal(store.getSnapshot().phase, 'idle');
    assert.ok(names.every(mesh => mesh.visibility === 1), 'homepage restores the names');
    assert.deepEqual(scene.meshes.map(mesh => mesh.getTotalVertices()), counts, 'no frame rebuilds geometry');
  } finally {
    controller.dispose(); gates.dispose();
    assert.equal(scene.meshes.length, 0);
    scene.dispose(); engine.dispose();
  }
  // Exercise the real dive wiring too: manually passing a fade must not be the only green path.
  const { createArenaDive } = await load('features/arena/arenaDive.ts');
  const { pageTransition } = await load('features/arena-page/pageTransitionStore.ts');
  const { journeyProgress } = await load('features/arena/journeyProgress.ts');
  const { parseEmblem } = await load('features/arena/emblemFormat.ts');
  const bytes = readFileSync(new URL('../../../public/arena/emblem.bin', import.meta.url));
  const asset = parseEmblem(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const actualEngine = new NullEngine(), actualScene = new B.Scene(actualEngine);
  const actualCamera = new A.FreeCamera('dive-name-proof', new B.Vector3(), actualScene);
  let reduced = false;
  journeyProgress.setLimit(8); journeyProgress.publish(1.4);
  const dive = createArenaDive(B, A, actualScene, actualCamera, asset, false, () => reduced, () => {});
  const step = dt => dive.step({ distance: 12, offsetX: 0.6, offsetY: 0.8 }, 0.62, dt, 1, 0, true, true);
  try {
    step(0); dive.setPageAvailable(true);
    const actualNames = actualScene.meshes.filter(mesh => mesh.name.startsWith('arenaPageGateName-'));
    assert.ok(actualNames.every(mesh => dive.meshes.includes(mesh)), 'the real scene lifecycle warms the lettering');
    pageTransition.request('about'); step(0.5);
    assert.ok(actualNames.every(mesh => mesh.visibility > 0.9));
    step(1); assert.ok(actualNames.every(mesh => mesh.visibility === 0), 'real dive suppresses names when the title appears');
    pageTransition.setScroll(1); step(0.5); assert.ok(actualNames.every(mesh => mesh.visibility === 0));
    reduced = true;
    pageTransition.request('partner'); step(0);
    assert.equal(pageTransition.getSnapshot().phase, 'settled');
    assert.ok(actualNames.every(mesh => mesh.visibility === 0), 'reduced-motion cut has no label flash');
    pageTransition.request(null); step(0);
    assert.equal(pageTransition.getSnapshot().phase, 'idle');
    assert.ok(actualNames.every(mesh => mesh.visibility > 0.9), 'homepage names return on the same static frame');
  } finally {
    dive.dispose(); actualScene.dispose(); actualEngine.dispose();
    pageTransition.request(null); journeyProgress.publish(0);
  }
});
