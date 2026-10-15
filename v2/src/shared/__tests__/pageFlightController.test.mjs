import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './loadTs.mjs';

const { load } = createLoader();
const { createPageTransitionStore } = await load('features/arena-page/pageTransitionStore.ts');
const { createPageFlightController } = await load('features/arena/pageFlightController.ts');
const { isSceneCovered } = await load('features/starfield/renderLoop.ts');

const home = { x: 0.7, y: -0.2, z: -11, pitch: 0.04, yaw: 0, roll: 0, fov: 0.62 };
function rig(phone = false) {
  let reduced = false, requests = 0;
  const camera = { position: { x: home.x, y: home.y, z: home.z, set(x,y,z) { Object.assign(this, {x,y,z}); } },
    rotation: { x: home.pitch, y: home.yaw, z: home.roll, set(x,y,z) { Object.assign(this, {x,y,z}); } }, fov: home.fov };
  const store = createPageTransitionStore();
  const controller = createPageFlightController(camera, phone, () => reduced, store, () => requests++);
  store.setAvailable(true);
  const pose = () => [camera.position.x,camera.position.y,camera.position.z,camera.rotation.x,camera.rotation.y,camera.rotation.z,camera.fov];
  const finish = () => { for (let i=0;i<100;i++) controller.step(1/60); };
  return { camera, store, controller, pose, finish, reduce(value) { reduced = value; }, requests: () => requests,
    dispose() { controller.dispose(); } };
}

test('live arena pages keep the existing render loop awake; games still cover it', () => {
  assert.equal(isSceneCovered(false, true), false);
  assert.equal(isSceneCovered(true, true), true);
});

test('real controller moves before 100ms, lands within budget and closes to the exact captured home pose', () => {
  for (const phone of [false,true]) {
    const r = rig(phone), start = r.pose();
    try {
      r.store.request('games');
      assert.equal(r.controller.isActive(), true);
      r.controller.step(0.05);
      assert.notDeepEqual(r.pose(), start);
      for (let i=0;i<(phone ? 22:28);i++) r.controller.step(0.05);
      assert.equal(r.store.getSnapshot().phase, 'settled');
      assert.equal(r.store.getSnapshot().targetPage, 'games');
      assert.equal(r.pose().every(Number.isFinite), true);
      r.store.request(null); r.finish();
      assert.equal(r.controller.isActive(), false);
      assert.equal(r.store.getSnapshot().phase, 'idle');
      assert.deepEqual(r.pose(), start);
    } finally { r.dispose(); }
  }
});

test('mid-flight switches and Escape replay a continuous route to home without stale completion', () => {
  const r = rig(), start = r.pose();
  try {
    r.store.request('about'); r.controller.step(0.3);
    const before = r.pose(); r.store.request('team');
    assert.deepEqual(r.pose(), before, 'retarget captures current pose without a teleport');
    r.controller.step(0.2); r.store.request(null);
    const closing = r.pose(); r.controller.step(0);
    assert.deepEqual(r.pose(), closing, 'reverse starts exactly at the interrupted sample');
    r.finish();
    assert.equal(r.store.getSnapshot().phase, 'idle');
    assert.deepEqual(r.pose(), start);
    r.store.request('partner'); r.controller.step(0.15); r.store.request(null); r.controller.step(0.1);
    const reopening = r.pose(); r.store.request('contact');
    assert.deepEqual(r.pose(), reopening);
    r.finish(); assert.equal(r.store.getSnapshot().phase, 'settled');
    r.store.request(null); r.finish(); assert.deepEqual(r.pose(), start);
  } finally { r.dispose(); }
});

test('page scrolling stays inside the arena, reduced motion cuts and disposal unsubscribes', () => {
  const r = rig(), start = r.pose();
  try {
    r.reduce(true); r.store.request('partner');
    assert.equal(r.store.getSnapshot().phase, 'settled', 'cut synchronously even with a stopped render loop');
    const resting = r.pose(); r.store.setScroll(1); r.controller.step(0);
    assert.deepEqual(r.pose(), resting, 'reduced motion also disables scroll parallax');
    r.reduce(false); r.controller.step(0.1);
    assert.notDeepEqual(r.pose(), resting);
    assert.ok(Math.hypot(r.camera.position.x, r.camera.position.z - 34) < 24);
    r.reduce(true); r.store.request(null);
    assert.equal(r.store.getSnapshot().phase, 'idle'); assert.deepEqual(r.pose(), start);
    assert.ok(r.requests() > 0);
    r.controller.dispose(); r.store.request('games');
    assert.deepEqual(r.pose(), start);
  } finally { r.dispose(); }
});
