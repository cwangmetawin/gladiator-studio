import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const { load } = createLoader();
const B = await load('shared/babylon/babylonCore.ts'), A = await load('features/arena/arenaCore.ts');
const { createHallScene } = await load('features/arena/hallScene.ts');
const { createHallLayer } = await load('features/arena/hallLayer.ts');
const { hallContent, hallDrawn } = await load('features/arena/hallState.ts');
const { coverForGame } = await load('features/arena/hallManifest.ts');
const { journeyProgress } = await load('features/arena/journeyProgress.ts');

const items = Array.from({ length: 8 }, (_, i) => {
  const game = { id: i, title: `Game ${i}`, category: 'slot', image: `/cover-${i}.jpg`, timeline: '', link: 'https://example.com' };
  return { game, cover: coverForGame(game, null, false) };
});
function rig(width = 1440, height = 900) {
  const engine = new NullEngine({ renderWidth: width, renderHeight: height }), scene = new B.Scene(engine);
  const camera = new A.FreeCamera('arenaCamera', new B.Vector3(0, 2.8, 16.9), scene);
  camera.fov = 0.82; camera.rotation.x = 0.065;
  const requests = [], callbacks = [];
  const texture = (url, onLoad, onError) => {
    requests.push(url); callbacks.push({ onLoad, onError });
    return A.RawTexture.CreateRGBATexture(new Uint8Array([100, 140, 180, 255]), 1, 1, scene, false, false);
  };
  return { engine, scene, camera, requests, callbacks, texture, dispose() { scene.dispose(); engine.dispose(); hallContent.publish([]); hallDrawn.publish(false); journeyProgress.publish(0); } };
}

test('the hall uses only the supplied scene, loads each unique cover once, and disposes all owned meshes/materials/textures', () => {
  const r = rig();
  try {
    const baseline = r.scene.textures.length;
    const hall = createHallScene(B, A, r.scene, items, false, () => {}, r.texture);
    assert.equal(r.engine.scenes.length, 1);
    assert.equal(r.requests.filter(url => url.startsWith('/cover')).length, 8);
    assert.equal(r.scene.getMeshByName('hallSlab0').getTotalVertices(), 24, 'real box geometry');
    assert.equal(r.scene.postProcesses.length, 0, 'the hall has no extra occlusion/post pass');
    hall.step({ offset: 0, fade: 1, dt: 0, time: 0, reduced: false });
    assert.equal(r.scene.getMeshByName('hallSlab0').isVisible, true);
    hall.setCovered(true);
    assert.equal(r.scene.getTransformNodeByName('arenaHall').isEnabled(), false);
    hall.setCovered(false);
    assert.equal(r.scene.getTransformNodeByName('arenaHall').isEnabled(), true, 'return restores the frozen ring without a lazy rebuild');
    const centre = r.scene.getMeshByName('hallSlab0');
    assert.ok(Math.abs(centre.scaling.x - 1.12) < 1e-6);
    hall.step({ offset: 1, fade: 1, dt: 0, time: 0, reduced: true });
    assert.equal(r.scene.getMeshByName('hallSlab1').scaling.x, 1.12);
    hall.step({ offset: 1, fade: 0, dt: 0, time: 0, reduced: true });
    assert.equal(r.scene.getTransformNodeByName('arenaHall').isEnabled(), false);
    hall.dispose(); hall.dispose();
    assert.equal(r.scene.meshes.length, 0); assert.equal(r.scene.transformNodes.length, 0);
    assert.equal(r.scene.materials.filter(m => m.name.startsWith('hall')).length, 0);
    assert.equal(r.scene.textures.length, baseline);
    for (const callback of r.callbacks) callback.onLoad();
    assert.equal(hallDrawn.getSnapshot(), false, 'late loads cannot revive disposed content');
  } finally { r.dispose(); }
});

test('phone ring has fewer visible slabs, no post-process, and shaders are registered by name for Babylon WebGL2 conversion', () => {
  const r = rig();
  try {
    const hall = createHallScene(B, A, r.scene, items, true, () => {}, r.texture);
    hall.step({ offset: 0, fade: 1, dt: 0, time: 0, reduced: true });
    assert.ok(r.scene.meshes.filter(m => m.name.startsWith('hallSlab') && m.isVisible).length <= 5);
    assert.equal(r.scene.postProcesses.length, 0);
    for (const name of ['arenaHallCard', 'arenaHallSky']) {
      assert.match(B.Effect.ShadersStore[`${name}VertexShader`], /gl_Position/);
      assert.match(B.Effect.ShadersStore[`${name}FragmentShader`], /gl_FragColor/);
    }
    hall.dispose();
  } finally { r.dispose(); }
});

test('real Babylon projection preserves the desktop 50% height and the phone width budget at the final M2 camera', () => {
  for (const [width, height] of [[1440, 900], [1024, 768], [320, 740], [390, 844]]) {
    const r = rig(width, height), phone = width < 768;
    try {
      const hall = createHallScene(B, A, r.scene, items, phone, () => {}, r.texture);
      hall.step({ offset: 0, fade: 1, dt: 0, time: 0, reduced: true });
      const slab = r.scene.getMeshByName('hallSlab0');
      slab.computeWorldMatrix(true); r.scene.updateTransformMatrix(true);
      const points = slab.getBoundingInfo().boundingBox.vectorsWorld.map(p => B.Vector3.Project(p,
        B.Matrix.Identity(), r.scene.getTransformMatrix(), r.camera.viewport.toGlobal(width, height)));
      const span = axis => Math.max(...points.map(p => p[axis])) - Math.min(...points.map(p => p[axis]));
      if (phone) assert.ok(span('x') / width <= 0.82, `${width}: ${span('x') / width}`);
      else assert.ok(span('y') / height >= 0.5);
      hall.dispose();
    } finally { r.dispose(); }
  }
});

test('texture errors try the catalogue URL once; repeated failures keep the labelled static fallback and dispose safely', () => {
  const r = rig();
  try {
    const entry = { ...items[0], cover: { ...items[0].cover, url: '/arena/games/test-640.webp' } };
    const hall = createHallScene(B, A, r.scene, [entry], false, () => {}, r.texture);
    r.callbacks[0].onError();
    assert.equal(r.requests.filter(url => url === entry.game.image).length, 1);
    r.callbacks.at(-1).onError();
    assert.equal(r.requests.filter(url => url === entry.game.image).length, 1);
    assert.equal(hallDrawn.getSnapshot(), false);
    hall.dispose();
  } finally { r.dispose(); }
});

test('the layer creates no hall/cover textures before the arena and refreshes a frozen reduced-motion frame only on changes', () => {
  const r = rig();
  let reduced = true, requests = 0;
  try {
    hallContent.publish([]);
    const layer = createHallLayer(B, A, r.scene, true, () => reduced, () => { requests++; }, r.texture);
    layer.step(0, 0, 0); assert.equal(r.requests.length, 0);
    hallContent.publish(items); journeyProgress.publish(0.5);
    layer.step(0, 0, 0); assert.equal(r.requests.length, 0, 'even catalogue arrival cannot start first-screen cover loads');
    journeyProgress.publish(1.1); layer.step(1, 0, 0);
    assert.ok(r.requests.length > 0);
    const before = requests;
    journeyProgress.setLimit(7);
    journeyProgress.publish(3.2);
    assert.equal(requests, before + 1);
    journeyProgress.publish(3.21);
    assert.equal(requests, before + 1, 'same selected still frame');
    reduced = false; journeyProgress.publish(4);
    assert.equal(requests, before + 1);
    layer.dispose();
    journeyProgress.publish(4.5); hallContent.publish([]);
    assert.equal(requests, before + 1);
  } finally { journeyProgress.setLimit(1.9); r.dispose(); }
});

test('the DOM phone tier also keeps the Babylon ring compact when the canvas is landscape-width', () => {
  const r = rig(844, 390);
  try {
    hallContent.publish(items.map(item => ({ ...item, compact: true })));
    const layer = createHallLayer(B, A, r.scene, false, () => false, () => {}, r.texture);
    journeyProgress.publish(1.1); layer.step(1, 0, 0);
    assert.ok(r.scene.meshes.filter(m => m.name.startsWith('hallSlab') && m.isVisible).length <= 5);
    layer.dispose();
  } finally { r.dispose(); }
});
