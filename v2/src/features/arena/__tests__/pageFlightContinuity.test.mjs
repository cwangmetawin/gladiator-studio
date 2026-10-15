import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const { load } = createLoader();
const B = await load('shared/babylon/babylonCore.ts'), A = await load('features/arena/arenaCore.ts');
const { createArenaDive } = await load('features/arena/arenaDive.ts');
const { journeyProgress } = await load('features/arena/journeyProgress.ts');
const { pageTransition } = await load('features/arena-page/pageTransitionStore.ts');
const { hallContent } = await load('features/arena/hallState.ts');
const { helmetMouthY } = await load('features/arena/cameraTrack.ts');
const { parseEmblem } = await load('features/arena/emblemFormat.ts');
const bytes = readFileSync(new URL('../../../../public/arena/emblem.bin', import.meta.url));
const asset = parseEmblem(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const framing = { distance: 12, offsetX: 0.6, offsetY: 1.1 };
const pose = camera => [...camera.position.asArray(), ...camera.rotation.asArray(), camera.fov];

test('the sampled takeover preserves every homepage pose and reaches the helmet before revealing the exterior', () => {
  for (const phone of [false, true]) for (const screens of [0, 0.3, 0.8, 1.9]) {
    const engine = new NullEngine(), scene = new B.Scene(engine);
    const camera = new A.FreeCamera('continuityCamera', new B.Vector3(), scene);
    let dive;
    const firstFrames = [];
    const renderCurrent = () => {
      if (!dive) return;
      const state = dive.step(framing, 0.62, 0, 1, 0, true, true);
      firstFrames.push({ pose: pose(camera), emblem: state.emblemVisible,
        arena: scene.getMeshByName('arenaColosseum').isVisible });
    };
    journeyProgress.publish(screens);
    dive = createArenaDive(B, A, scene, camera, asset, phone, () => false, renderCurrent);
    try {
      const before = dive.step(framing, 0.62, 0, 1, 0, true, true), start = pose(camera);
      const arenaVisible = scene.getMeshByName('arenaColosseum').isVisible;
      dive.setPageAvailable(true);
      pageTransition.request('about');
      assert.deepEqual(firstFrames.at(-1), { pose: start, emblem: before.emblemVisible, arena: arenaVisible },
        `${screens}: the immediate sampled frame is the visitor's current composition`);
      if (screens === 0) {
        const early = dive.step(framing, 0.62, 0.03, 1, 0, true, true);
        assert.ok(camera.position.z > start[2], 'the visitor moves forward within 100 ms');
        assert.equal(early.emblemVisible, true);
        assert.equal(scene.getMeshByName('arenaColosseum').isVisible, false,
          'no arena crossfade behind an unchanged emblem while the lens is still far from its mouth');
        let closest = Infinity, mouthPose;
        for (let index = 0; index < 130; index++) {
          dive.step(framing, 0.62, 0.005, 1, index * 0.005, true, true);
          if (Math.abs(camera.position.z) < closest) { closest = Math.abs(camera.position.z); mouthPose = pose(camera); }
        }
        assert.ok(closest < 0.22, 'the actual camera crosses the helmet plane');
        assert.ok(Math.abs(mouthPose[0] - framing.offsetX) < 0.08, 'cross through the opening, never the wing');
        assert.ok(Math.abs(mouthPose[1] - framing.offsetY - helmetMouthY(asset.cap.positions)) < 0.1,
          'cross below the visor at the baked mouth');
      }
      pageTransition.request(null);
      for (let frame = 0; frame < 100; frame++) dive.step(framing, 0.62, 1 / 60, 1, 1, true, true);
      assert.deepEqual(pose(camera), start, `${screens}: reverse restores the captured camera exactly`);
    } finally {
      pageTransition.request(null); dive.dispose(); scene.dispose(); engine.dispose(); journeyProgress.publish(0);
    }
  }
});

test('a real mounted games ring remains in the captured composition while the flight takes the camera', () => {
  const engine = new NullEngine(), scene = new B.Scene(engine);
  const camera = new A.FreeCamera('ringContinuityCamera', new B.Vector3(), scene);
  // Only image I/O is replaced. The hall, its root, card geometry, camera and takeover are the shipped code.
  function OfflineTexture() {
    return A.RawTexture.CreateRGBATexture(new Uint8Array([100, 140, 180, 255]), 1, 1, scene, false, false);
  }
  Object.assign(OfflineTexture, { TRILINEAR_SAMPLINGMODE: B.Texture.TRILINEAR_SAMPLINGMODE,
    CLAMP_ADDRESSMODE: B.Texture.CLAMP_ADDRESSMODE });
  hallContent.publish([{ game: { id: 1, title: 'Ring continuity' }, cover: { url: '/local.webp', fallbackUrl: '',
    primary: [0.38, 0.65, 0.82], secondary: [0.2, 0.4, 0.6] } }]);
  journeyProgress.publish(1.9);
  const dive = createArenaDive({ ...B, Texture: OfflineTexture }, A, scene, camera, asset, true, () => false, () => {});
  try {
    dive.step(framing, 0.62, 0, 1, 0, true, true);
    const root = scene.getTransformNodeByName('arenaHall'), slab = scene.getMeshByName('hallSlab0');
    assert.ok(root.isEnabled() && slab.isVisible, 'the starting ring is actually mounted and visible');
    const start = pose(camera), textures = scene.textures.length, meshes = scene.meshes.length;
    dive.setPageAvailable(true); pageTransition.request('team');
    dive.step(framing, 0.62, 0, 1, 0, true, true);
    assert.deepEqual(pose(camera), start);
    assert.ok(root.isEnabled() && slab.isVisible, 'takeover cannot cut away the ring before the camera departs');
    dive.step(framing, 0.62, 1 / 60, 1, 1 / 60, true, true);
    assert.equal(scene.textures.length, textures); assert.equal(scene.meshes.length, meshes);
  } finally {
    pageTransition.request(null); dive.dispose(); scene.dispose(); engine.dispose();
    hallContent.publish([]); journeyProgress.publish(0);
  }
});

test('the rendered game tint survives takeover, flight, page switches and the complete reverse route', () => {
  const engine = new NullEngine(), scene = new B.Scene(engine);
  const camera = new A.FreeCamera('tintContinuityCamera', new B.Vector3(), scene);
  function OfflineTexture() {
    return A.RawTexture.CreateRGBATexture(new Uint8Array([160, 80, 20, 255]), 1, 1, scene, false, false);
  }
  Object.assign(OfflineTexture, { TRILINEAR_SAMPLINGMODE: B.Texture.TRILINEAR_SAMPLINGMODE,
    CLAMP_ADDRESSMODE: B.Texture.CLAMP_ADDRESSMODE });
  const primary = [0.9, 0.25, 0.08];
  hallContent.publish([{ game: { id: 2, title: 'Warm ring' }, cover: { url: '/warm.webp', fallbackUrl: '',
    primary, secondary: [0.2, 0.1, 0.05] } }]);
  journeyProgress.publish(1.9);
  const dive = createArenaDive({ ...B, Texture: OfflineTexture }, A, scene, camera, asset, true, () => false, () => {});
  const step = (dt = 0, time = 1) => dive.step(framing, 0.62, dt, 1, time, true, true);
  // Read only numeric components of the real shader uniform; never assert on the live material.
  const tint = () => scene.getMeshByName('arenaFloor').material._colors3.uTheme.asArray();
  try {
    step(0, 0); step(0, 1);
    const captured = tint();
    assert.ok(captured.every((value, index) => Math.abs(value - primary[index]) < 1e-12),
      'the starting composition is a coloured game theme, not default steel');
    dive.setPageAvailable(true); pageTransition.request('about'); step();
    assert.deepEqual(tint(), captured, 'the first takeover sample preserves the floor tint');
    step(0.3); assert.deepEqual(tint(), captured, 'the opening flight preserves the rendered theme');
    pageTransition.request('partner'); step(0.15); assert.deepEqual(tint(), captured, 'retargeting does not reset lighting');
    pageTransition.request(null);
    for (let frame = 0; frame < 100; frame++) {
      step(1 / 60);
      assert.deepEqual(tint(), captured, 'the reverse flight and returned homepage retain the original tint');
    }
    assert.equal(pageTransition.getSnapshot().phase, 'idle');
  } finally {
    pageTransition.request(null); dive.dispose(); scene.dispose(); engine.dispose();
    hallContent.publish([]); journeyProgress.publish(0);
  }
});
