// Run with npm run test:unit. The 3D emblem's pure maths: pointer following, framing, the box share,
// the arrival timeline, the arc rhythm, quality tiers and the two hand-off stores (Phase 4 M1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const loader = createLoader();
const pointer = await loader.load('features/arena/pointerFollow.ts');
const framing = await loader.load('features/arena/framing.ts');
const ignition = await loader.load('features/arena/ignition.ts');
const schedule = await loader.load('features/arena/arcSchedule.ts');
const quality = await loader.load('features/arena/arenaQuality.ts');
const slotStore = await loader.load('features/arena/emblemSlot.ts');
const reveal = await loader.load('shared/brand/homeReveal.ts');
const arcs = await loader.load('shared/brand/emblemArcs.ts');

const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? ''} ${actual} vs ${expected}`);

// ── pointer following ──────────────────────────────────────────────────────────────────────────────────

test('the pointer maps to [-1, 1] on both axes and clamps outside the window', () => {
  assert.deepEqual(pointer.pointerPose(0, 0, 1440, 900), { x: -1, y: -1 });
  assert.deepEqual(pointer.pointerPose(1440, 900, 1440, 900), { x: 1, y: 1 });
  assert.deepEqual(pointer.pointerPose(720, 450, 1440, 900), { x: 0, y: 0 });
  assert.deepEqual(pointer.pointerPose(5000, -50, 1440, 900), { x: 1, y: -1 });
  assert.deepEqual(pointer.pointerPose(10, 10, 0, 0), pointer.REST_POSE, 'a zero-size window falls back to the rest pose');
});

test('the emblem turns at most 8 degrees of yaw and 5 of pitch, towards the pointer', () => {
  const deg = (r) => (r * 180) / Math.PI;
  const right = pointer.emblemRotation({ x: 1, y: 0 });
  const down = pointer.emblemRotation({ x: 0, y: 1 });
  near(deg(right.yaw), -8, 1e-9, 'pointer on the right: yaw -8');
  near(deg(down.pitch), -5, 1e-9, 'pointer at the bottom: pitch -5');
  const corner = pointer.emblemRotation({ x: -1, y: -1 });
  near(deg(corner.yaw), 8, 1e-9); near(deg(corner.pitch), 5, 1e-9);
  assert.deepEqual(pointer.emblemRotation({ x: 1, y: 1 }, 0), { yaw: -0, pitch: -0 }, 'no presence, no turn');
  assert.equal(pointer.POINTER_YAW_DEG, 8); assert.equal(pointer.POINTER_PITCH_DEG, 5);
});

test('a mouse idle for 4 s, or no mouse at all, hands over to a slow automatic sway', () => {
  assert.equal(pointer.shouldSway(false, 1000, 0), false, 'a pointer that just moved is followed');
  assert.equal(pointer.shouldSway(false, 4001, 0), true, 'idle for more than 4 s: sway');
  assert.equal(pointer.shouldSway(true, 0, 0), true, 'touch only: always sway');
  for (let t = 0; t < 60; t += 0.5) {
    const s = pointer.swayPose(t);
    assert.ok(Math.abs(s.x) <= 0.45 + 1e-9 && s.y >= -0.5 - 1e-9 && s.y <= -0.1 + 1e-9, `sway stays small at ${t}`);
  }
});

test('following approaches the target without overshoot, faster for a real pointer than for the sway', () => {
  const from = { x: 0, y: 0 }, to = { x: 1, y: -1 };
  const fast = pointer.followPose(from, to, false, 0.1), slow = pointer.followPose(from, to, true, 0.1);
  assert.ok(fast.x > slow.x && fast.x < 1 && slow.x > 0);
  assert.deepEqual(pointer.followPose(to, to, false, 0.016), to, 'at the target it stays');
  const stuck = pointer.followPose(from, to, false, 0);
  assert.deepEqual(stuck, from, 'a static frame (dt 0) does not move the pose');
});

// ── framing ────────────────────────────────────────────────────────────────────────────────────────────

test('framing puts an emblem of the given width on the rectangle: project it back and compare', () => {
  const viewport = { width: 1440, height: 900 }, fov = framing.FOV_DESKTOP, width = 9.35, height = 2.37;
  const rect = { x: 160, y: 120, width: 1120, height: 280 };
  const f = framing.framingFor(rect, viewport, width, fov);
  // Four corners of the emblem plane (z = 0), projected through the camera.
  const corners = new Float32Array([-width / 2, height / 2, 0, width / 2, height / 2, 0, -width / 2, -height / 2, 0, width / 2, -height / 2, 0]);
  const box = framing.projectedBox(corners, f, viewport, fov);
  near(box.x, rect.x, 0.01, 'left'); near(box.width, rect.width, 0.01, 'width');
  near(box.x + box.width / 2, rect.x + rect.width / 2, 0.01, 'centre x');
  near(box.y + box.height / 2, rect.y + rect.height / 2, 0.01, 'centre y');
});

test('an emblem wider than the viewport is clipped to it, so a phone can show a 114 % emblem', () => {
  const viewport = { width: 390, height: 844 }, fov = framing.FOV_PHONE, width = 9.35;
  const slot = { x: 0, y: 200, width: 390, height: 300 };
  const rect = framing.emblemRect(slot, { width, height: 2.37 }, 1.14);
  near(rect.width, 444.6, 1e-9); near(rect.x, -27.3, 1e-9);
  const f = framing.framingFor(rect, viewport, width, fov);
  const box = framing.projectedBox(new Float32Array([-width / 2, 0.5, 0, width / 2, 0.5, 0, 0, -0.5, 0]), f, viewport, fov);
  assert.equal(box.x, 0); assert.equal(box.width, 390, 'clipped to the viewport on both sides');
});

test('blending two framings is exact at the ends and monotone between', () => {
  const a = { distance: 10, offsetX: 0, offsetY: 1 }, b = { distance: 14, offsetX: 2, offsetY: -1 };
  assert.deepEqual(framing.blendFraming(a, b, 0), a); assert.deepEqual(framing.blendFraming(a, b, 1), b);
  assert.deepEqual(framing.blendFraming(a, b, 0.5), { distance: 12, offsetX: 1, offsetY: 0 });
  assert.deepEqual(framing.blendFraming(a, b, -3), a, 'clamped below'); assert.deepEqual(framing.blendFraming(a, b, 7), b, 'clamped above');
});

test('the box shares report width, viewport area and stage area, and cope with an empty stage', () => {
  const viewport = { width: 1000, height: 500 };
  const shares = framing.boxShares({ x: 100, y: 100, width: 800, height: 200 }, viewport, { x: 0, y: 50, width: 1000, height: 250 });
  near(shares.width, 0.8, 1e-12); near(shares.viewportArea, 0.32, 1e-12); near(shares.stageArea, 0.64, 1e-12);
  assert.equal(framing.boxShares({ x: 0, y: 0, width: 10, height: 10 }, viewport, { x: 0, y: 0, width: 0, height: 0 }).stageArea, 0);
});

// ── arrival timeline ───────────────────────────────────────────────────────────────────────────────────

test('the arrival settles: the flash decays to nothing, exposure returns to 1, the halo to its rest level', () => {
  const start = ignition.arrival(0), mid = ignition.arrival(0.3), end = ignition.arrival(ignition.SETTLED_S);
  assert.ok(start.flash > mid.flash && mid.flash > end.flash && end.flash === 0);
  assert.ok(start.exposure > mid.exposure && end.exposure === 1);
  assert.ok(start.halo > end.halo); near(end.halo, ignition.SETTLED.halo, 1e-9);
  const before = ignition.arrival(-1);
  assert.equal(before.flash, start.flash, 'waiting under the gate shows the opening level, not a darker one');
  assert.equal(before.progress, -1, 'the ignition current has not started before the release');
});

test('the ignition current runs once, from before the helmet to past the wing tips, then switches off', () => {
  let previous = -2, ended = false;
  for (let t = 0; t <= 2; t += 0.02) {
    const a = ignition.arrival(t);
    assert.ok(a.progress >= previous - 1e-12, `progress never goes backwards at ${t}`);
    previous = a.progress;
    if (!a.currentOn) ended = true; else assert.equal(ended, false, 'once off, it stays off');
  }
  near(ignition.arrival(ignition.CURRENT_START_S + ignition.CURRENT_S).progress, 1.4, 1e-9);
});

test('the glide from the gate rectangle to the page is eased, exact at both ends', () => {
  assert.equal(ignition.glide(-1), 0); assert.equal(ignition.glide(0), 0);
  assert.equal(ignition.glide(ignition.GLIDE_S), 1); assert.equal(ignition.glide(99), 1);
  assert.ok(ignition.glide(0.1) < 0.1 / ignition.GLIDE_S, 'it eases in');
  let previous = 0;
  for (let t = 0; t <= ignition.GLIDE_S; t += 0.05) { const g = ignition.glide(t); assert.ok(g >= previous); previous = g; }
});

// ── arcs: the rhythm the 2D gate emblem already has ────────────────────────────────────────────────────

function lcg(seed) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; }; }

test('3D arcs fire one at a time, 2.6-4.2 s apart, never the same wing twice running, and every wing gets its turn', () => {
  const scheduler = schedule.createArcScheduler(lcg(7));
  const times = [], wings = [];
  for (let ms = 0; ms < 20 * 60 * 1000; ms += 16) {
    const feather = scheduler.poll(ms);
    if (feather !== null) { times.push(ms); wings.push(feather); }
  }
  assert.ok(times.length > 250, `${times.length} arcs in 20 minutes`);
  assert.ok(times[0] >= arcs.ARC_FIRST_MS && times[0] < arcs.ARC_FIRST_MS + 20, 'the first arc waits for the opening');
  for (let i = 1; i < times.length; i++) {
    const gap = times[i] - times[i - 1];
    assert.ok(gap >= arcs.ARC_MIN_GAP_MS - 1 && gap <= arcs.ARC_MAX_GAP_MS + 16, `gap ${gap}`);
    assert.ok(gap > schedule.ARC_FLASH_MS, 'the previous arc has ended: one at a time');
    assert.notEqual(wings[i], wings[i - 1]);
  }
  assert.equal(new Set(wings).size, 6);
});

// ── quality tiers ──────────────────────────────────────────────────────────────────────────────────────

test('a phone renders at no more than 1.5x its CSS size, without MSAA and without a pointer; a desktop keeps MSAA', () => {
  const phone = quality.arenaQuality(true, 3), desktop = quality.arenaQuality(false, 2), plain = quality.arenaQuality(false, 1);
  near(phone.hardwareScaling, 1 / 1.5, 1e-12); near(desktop.hardwareScaling, 1 / 1.5, 1e-12); assert.equal(plain.hardwareScaling, 1);
  assert.equal(phone.antialias, false); assert.equal(desktop.antialias, true);
  assert.equal(phone.pointer, false); assert.equal(desktop.pointer, true);
  assert.ok(phone.anisotropy < desktop.anisotropy);
  assert.equal(quality.arenaQuality(false, NaN).hardwareScaling, 1, 'a missing device pixel ratio counts as 1');
});

// ── the two hand-off stores ────────────────────────────────────────────────────────────────────────────

test('the home reveal releases once, notifies subscribers once, and can start over', () => {
  let clock = 100;
  const store = reveal.createHomeReveal(() => clock);
  let notified = 0;
  const off = store.subscribe(() => { notified += 1; });
  assert.equal(store.getSnapshot(), null);
  store.release(); clock = 250; store.release();
  assert.equal(store.getSnapshot(), 100, 'the first release wins');
  assert.equal(notified, 1);
  store.reset(); assert.equal(store.getSnapshot(), null); assert.equal(notified, 2);
  off(); store.release(); assert.equal(notified, 2, 'no news after unsubscribe');
});

test('the emblem slot store ignores an identical measurement and notifies on a real change', () => {
  const store = slotStore.createEmblemSlot();
  const state = (x) => ({ slot: { x, y: 60, width: 1000, height: 300 }, fraction: 0.86, stage: { x: 0, y: 60, width: 1440, height: 560 }, viewport: { width: 1440, height: 900 } });
  let notified = 0;
  store.subscribe(() => { notified += 1; });
  store.publish(state(100)); store.publish(state(100)); assert.equal(notified, 1);
  store.publish(state(120)); assert.equal(notified, 2);
  store.publish(null); assert.equal(store.getSnapshot(), null); assert.equal(notified, 3);
});
