import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const { load } = createLoader();
const B = await load('shared/babylon/babylonCore.ts'), A = await load('features/arena/arenaCore.ts');
const { createArenaDive } = await load('features/arena/arenaDive.ts');
const { createDiveFlash } = await load('features/arena/diveFlash.ts');
const { journeyProgress } = await load('features/arena/journeyProgress.ts');
const { parseEmblem } = await load('features/arena/emblemFormat.ts');
const bytes = readFileSync(new URL('../../../../public/arena/emblem.bin', import.meta.url));
const asset = parseEmblem(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const frame = { distance: 12, offsetX: 0, offsetY: 0.8 };

function rig(phone = true) {
  const engine = new NullEngine(), scene = new B.Scene(engine);
  const camera = new A.FreeCamera('arenaCamera', new B.Vector3(), scene);
  let reduced = false, staticRequests = 0;
  const dive = createArenaDive(B, A, scene, camera, asset, phone, () => reduced, () => { staticRequests++; });
  return {
    scene, camera, dive, engine,
    reduce: value => { reduced = value; },
    staticRequests: () => staticRequests,
    step: (dt = 0, visibility = 1, time = 0, home = true) => dive.step(frame, 0.62, dt, visibility, time, home, true),
    dispose: () => { dive.dispose(); scene.dispose(); engine.dispose(); journeyProgress.publish(0); },
  };
}

test('the actual camera uses the pure track in the same scene, settles the emblem before the mouth and replays exactly', () => {
  const r = rig();
  try {
    const positions = Array.from({ length: 191 }, (_, i) => i / 100);
    const sample = screens => {
      journeyProgress.publish(screens);
      const state = r.step();
      return { pose: [...r.camera.position.asArray(), r.camera.fov, r.camera.rotation.x], state };
    };
    const forward = positions.map(sample), backward = [...positions].reverse().map(sample).reverse();
    assert.deepEqual(forward, backward);
    assert.equal(sample(0.5).state.presence, 0, 'no sway or pointer rotation at the mouth');
    assert.equal(sample(0).state.emblemVisible, true);
    assert.equal(sample(0.9).state.emblemVisible, false);
    assert.equal(r.engine.scenes.length, 1);
    journeyProgress.publish(1.4);
    r.step(1 / 60);
    assert.equal(journeyProgress.getSnapshot(), 1.4, 'damping cannot write to document progress');
    r.step(0, 0);
    assert.ok(r.dive.meshes.every(mesh => !mesh.isVisible), 'covered home draws no arena geometry');
  } finally { r.dispose(); }
});

test('reduced motion requests only the still frames at the cut and unsubscribes on dispose', () => {
  const r = rig();
  try {
    r.reduce(true);
    for (const screens of [0.2, 0.5, 0.99]) {
      journeyProgress.publish(screens); r.step();
      assert.equal(r.camera.position.z, -12);
    }
    assert.equal(r.staticRequests(), 0);
    journeyProgress.publish(1); r.step();
    assert.equal(r.staticRequests(), 1);
    assert.equal(r.camera.position.z, 16.9);
    journeyProgress.publish(1.5); r.step();
    assert.equal(r.staticRequests(), 1, 'no repeated static draws while reading the second screen');
    journeyProgress.publish(0.9); r.step();
    assert.equal(r.staticRequests(), 2);
    r.dive.dispose();
    journeyProgress.publish(1.8);
    assert.equal(r.staticRequests(), 2);
  } finally { r.dispose(); }
});

test('the desktop post pass warms detached, attaches only when compiled over an opaque night, and detaches on return/cover/reduced motion', () => {
  let made = 0, disposed = 0, attached = 0, ready = false;
  const camera = { attachPostProcess: () => { attached++; }, detachPostProcess: () => { attached--; } };
  class PostProcess {
    constructor() { made++; }
    isReady() { return ready; }
    dispose() { disposed++; }
  }
  const stub = { PostProcess, Texture: { BILINEAR_SAMPLINGMODE: 2 }, Effect: { ShadersStore: {} } };
  const scene = { activeCamera: camera, getEngine: () => ({}) };
  const phone = createDiveFlash(stub, scene, true);
  phone.update(0.621, false, true, true, true); phone.dispose();
  assert.equal(made, 0);
  const desktop = createDiveFlash(stub, scene, false);
  desktop.update(0, false, true, false, true);
  assert.equal(made, 1); assert.equal(attached, 0);
  desktop.update(0.621, false, true, true, true); assert.equal(attached, 0, 'a pending shader cannot black out the scene');
  ready = true;
  desktop.update(0.621, false, true, false, true); assert.equal(attached, 0);
  desktop.update(0.621, false, true, true, true); assert.equal(attached, 1);
  desktop.update(0.9, false, true, true, true); assert.equal(attached, 0);
  desktop.update(0.621, false, true, true, true);
  desktop.update(0.621, false, false, true, true); assert.equal(attached, 0);
  desktop.update(0.621, false, true, true, true);
  desktop.update(0.621, true, true, true, true); assert.equal(attached, 0);
  desktop.dispose(); assert.equal(disposed, 1);
});

test('the crossing pass registers its shader by name (Babylon converts it for WebGL2), never as a raw source string', () => {
  // Why: 'source:' + GLSL skipped Babylon's WebGL2 conversion, the effect failed to compile ('varying' in a
  // #version 300 es fragment) and the whole arena scene never became ready on desktop.
  const calls = [];
  class PostProcess { constructor(name, fragment) { calls.push({ name, fragment }); } isReady() { return false; } dispose() {} }
  const stub = { PostProcess, Texture: { BILINEAR_SAMPLINGMODE: 2 }, Effect: { ShadersStore: {} } };
  const scene = { activeCamera: { attachPostProcess() {}, detachPostProcess() {} }, getEngine: () => ({}) };
  const flash = createDiveFlash(stub, scene, false);
  flash.update(0, false, true, false, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fragment, calls[0].name, 'the pass names a ShadersStore entry');
  assert.doesNotMatch(String(calls[0].fragment), /^source:/);
  assert.match(stub.Effect.ShadersStore[`${calls[0].name}FragmentShader`] ?? '', /gl_FragColor/);
  flash.dispose();
});

test('no crossing pass exists before the arena scene is ready, so a broken effect can never hold the scene in loading', () => {
  // Why: Scene.isReady waits for every effect on the engine; a pass that cannot compile kept executeWhenReady
  // from ever firing. The pass is optional polish, so it is created only once the scene is ready.
  let made = 0;
  class PostProcess { constructor() { made++; } isReady() { return false; } dispose() {} }
  const stub = { PostProcess, Texture: { BILINEAR_SAMPLINGMODE: 2 }, Effect: { ShadersStore: {} } };
  const scene = { activeCamera: { attachPostProcess() {}, detachPostProcess() {} }, getEngine: () => ({}) };
  const flash = createDiveFlash(stub, scene, false);
  flash.update(0.621, false, true, true, false);
  assert.equal(made, 0, 'not before the scene is ready');
  flash.update(0.621, false, true, true, true);
  assert.equal(made, 1, 'created once it is');
  flash.dispose();
});
