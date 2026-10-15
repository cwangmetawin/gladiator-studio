import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { createLoader } from './loadTs.mjs';

const { load } = createLoader();
const B = await load('shared/babylon/babylonCore.ts'), A = await load('features/arena/arenaCore.ts');
const { createArenaDive } = await load('features/arena/arenaDive.ts');
const { journeyProgress } = await load('features/arena/journeyProgress.ts');
const { pageTransition } = await load('features/arena-page/pageTransitionStore.ts');
const { hallContent } = await load('features/arena/hallState.ts');
const { createPageGates } = await load('features/arena/pageGates.ts');
const { parseEmblem } = await load('features/arena/emblemFormat.ts');
const bytes = readFileSync(new URL('../../../public/arena/emblem.bin', import.meta.url));
const asset = parseEmblem(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const frame = { distance: 12, offsetX: 0.6, offsetY: 0.8 };

function rig(phone, screens) {
  journeyProgress.setLimit(8); journeyProgress.publish(screens);
  const engine = new NullEngine(), scene = new B.Scene(engine);
  const camera = new A.FreeCamera('arenaCamera', new B.Vector3(), scene);
  let reduced = false, time = 0;
  const dive = createArenaDive(B, A, scene, camera, asset, phone, () => reduced, () => {});
  const step = (dt = 0) => { time += dt; return dive.step(frame, 0.62, dt, 1, time, true, true); };
  step(); dive.setPageAvailable(true);
  return { engine, scene, camera, dive, step, reduce(value) { reduced = value; },
    pose: () => [...camera.position.asArray(), ...camera.rotation.asArray(), camera.fov],
    finish() { for (let i=0;i<90;i++) step(1/60); },
    dispose() { dive.dispose(); scene.dispose(); engine.dispose(); pageTransition.request(null); journeyProgress.publish(0); } };
}

test('all eight real camera landings work from hero, helmet dive, arena and games ring on the same scene', () => {
  for (const phone of [false,true]) for (const screens of [0,0.45,1.4,3.1]) {
    const r = rig(phone, screens), start = r.pose(), meshes = r.scene.meshes.length, textures = r.scene.textures.length;
    try {
      for (const gate of createPageGates(phone ? 40:64)) {
        pageTransition.request(gate.id); r.finish();
        assert.equal(pageTransition.getSnapshot().phase, 'settled');
        assert.equal(r.camera.position.x, gate.restPose.x); assert.equal(r.camera.position.z, gate.restPose.z);
        assert.ok(r.dive.meshes.every(mesh => mesh.isVisible), 'world remains live behind the page');
        assert.equal(r.scene.getMeshByName(`arenaPageGate-${gate.id}`).isVisible, true);
        assert.equal(r.engine.scenes.length, 1); assert.equal(r.scene.meshes.length, meshes);
        assert.equal(r.scene.textures.length, textures, 'no flight-time material or texture creation');
        assert.equal(journeyProgress.getSnapshot(), screens, 'page motion cannot rewrite homepage journey');
        pageTransition.request(null); r.finish();
        assert.deepEqual(r.pose(), start, 'home camera returns exactly');
      }
    } finally { r.dispose(); }
  }
});

test('scroll, switch, interrupted reverse and reduced-motion still paints preserve actual camera ownership', () => {
  const r = rig(false, 0.45), start = r.pose();
  try {
    pageTransition.request('about'); r.finish(); pageTransition.setScroll(1); r.step(0.3);
    const scrolled = r.pose(); pageTransition.request('partner'); r.step(0);
    assert.deepEqual(r.pose(), scrolled);
    r.step(0.2); pageTransition.request(null); r.step(0.15);
    const reversing = r.pose(); pageTransition.request('games'); r.step(0);
    assert.deepEqual(r.pose(), reversing);
    r.finish(); pageTransition.request(null); r.finish(); assert.deepEqual(r.pose(), start);
    r.reduce(true); r.step(); const reducedStart = r.pose();
    pageTransition.request('contact'); r.step();
    assert.equal(pageTransition.getSnapshot().phase, 'settled');
    assert.ok(r.scene.getMeshByName('arenaColosseum').isVisible, 'one static frame includes the arena');
    pageTransition.request(null); r.step(); assert.deepEqual(r.pose(), reducedStart);
    pageTransition.request('team'); r.step(); r.dive.setPageAvailable(false);
    assert.equal(pageTransition.getSnapshot().phase, 'settled', 'unavailable scene releases fallback content');
    assert.equal(pageTransition.getSnapshot().sceneAvailable, false);
  } finally { r.dispose(); }
});

test('late games-ring data cannot create textures, meshes or shaders during a page flight', () => {
  const r = rig(false, 3.1), before = r.scene.meshes.length;
  try {
    pageTransition.request('games');
    // A trap at the art boundary proves the real hall builder is not entered during takeover.
    hallContent.publish([{ game: { id: 1, title: 'Late game' }, get cover() { throw new Error('flight initialized hall art'); } }]);
    assert.doesNotThrow(() => r.step(1/60));
    assert.equal(r.scene.meshes.length, before);
  } finally { r.dispose(); hallContent.publish([]); }
});
