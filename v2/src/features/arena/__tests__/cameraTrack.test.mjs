import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const { load } = createLoader();
const { createPchip } = await load('features/arena/pchip.ts');
const { createCameraTrack } = await load('features/arena/cameraTrack.ts');
const journey = await load('features/arena/journeyProgress.ts');
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);

test('PCHIP hits every knot, clamps its ends and never overshoots any ascending, descending or flat segment', () => {
  for (const keys of [
    [[0, 0], [0.2, 1], [0.7, 1.1], [1, 9]],
    [[0, 9], [0.05, 1.1], [0.7, 1], [1, 0]],
    [[0, 0], [0.2, 4], [0.4, 4], [0.6, -2], [1, 3]],
  ]) {
    const sample = createPchip(keys);
    assert.equal(sample(-100), keys[0][1]);
    assert.equal(sample(100), keys.at(-1)[1]);
    keys.forEach(([p, value]) => near(sample(p), value));
    for (let i = 1; i < keys.length; i++) {
      const [x0, a] = keys[i - 1], [x1, b] = keys[i];
      let previous = a;
      for (let step = 1; step <= 500; step++) {
        const value = sample(x0 + (x1 - x0) * step / 500);
        assert.ok(value >= Math.min(a, b) - 1e-10 && value <= Math.max(a, b) + 1e-10);
        assert.ok((value - previous) * Math.sign(b - a) >= -1e-10, 'monotone inside each segment');
        previous = value;
      }
    }
  }
});

test('PCHIP owns its knots and rejects malformed tracks instead of producing NaN', () => {
  for (const keys of [[], [[0, 1]], [[0, 1], [0, 2]], [[1, 1], [0, 2]], [[0, NaN], [1, 2]]]) {
    assert.throws(() => createPchip(keys), /track/i);
  }
  const keys = [[0, 1], [1, 3]], sample = createPchip(keys);
  keys[0][1] = 99;
  assert.equal(sample(0), 1);
  assert.equal(sample(NaN), 1);
});

test('native document scroll maps screen distances exactly, including an offset track and rubber-band edges', () => {
  near(journey.scrollScreens(810, 900), 0.9);
  near(journey.scrollScreens(1710, 900), 1.9);
  near(journey.scrollScreens(910, 900, 100), 0.9);
  assert.equal(journey.scrollScreens(-100, 900), 0);
  assert.equal(journey.scrollScreens(999999, 900), 1.9);
  assert.equal(journey.scrollScreens(100, 0), 0);
  assert.equal(journey.scrollScreens(NaN, 900), 0);
});

test('camera targets are bit-identical when sampled forwards and backwards (zero replay error)', () => {
  for (const framing of [
    { distance: 9, offsetX: 0, offsetY: 0.8, fov: 0.62, mouthY: -0.75 },
    { distance: 23, offsetX: 0.1, offsetY: 1.6, fov: 0.9, mouthY: -0.75 },
  ]) {
    const sample = createCameraTrack(framing);
    const positions = Array.from({ length: 1901 }, (_, i) => i / 1000);
    const forward = positions.map(sample);
    const backward = [...positions].reverse().map(sample).reverse();
    assert.deepEqual(forward, backward);
    assert.equal(forward[0].z, -framing.distance);
    assert.equal(forward[0].fov, framing.fov);
    assert.ok(forward.every((pose, i) => i === 0 || pose.z >= forward[i - 1].z), 'never reverses on the way in');
    assert.ok(forward.every(pose => Object.values(pose).every(Number.isFinite)));
    near(sample(0.9 * 0.62).y, framing.offsetY + framing.mouthY);
    assert.ok(sample(0.9 * 0.62).z < 0 && sample(0.9 * 0.76).z > 0, 'crosses the mouth');
    assert.ok(sample(0.9 * 0.7).fov > framing.fov, 'widens at the crossing');
    near(sample(1.9).z, 16.9);
    assert.deepEqual(sample(999), sample(1.9));
    const creep = sample(0.9 * 0.62).z - sample(0.9 * 0.45).z;
    const crossing = sample(0.9 * 0.76).z - sample(0.9 * 0.62).z;
    assert.ok(creep / 0.17 < crossing / 0.14, 'slows at the mouth before accelerating through');
  }
});

test('reduced motion cuts once after the first screen, with no intermediate camera positions', () => {
  for (const screens of [0, 0.2, 0.8999, 0.9999]) assert.equal(journey.cameraScreens(screens, true), 0);
  for (const screens of [1, 1.01, 1.4, 1.9]) assert.equal(journey.cameraScreens(screens, true), 1.9);
  for (const screens of [0, 0.4, 0.9, 1.9]) assert.equal(journey.cameraScreens(screens, false), screens);
});

test('doors belong only to the visible first screen and never survive the reduced-motion cut', () => {
  assert.equal(journey.doorsVisible(0, false), true);
  assert.equal(journey.doorsVisible(0.05, false), true);
  assert.equal(journey.doorsVisible(0.2, false), false);
  assert.equal(journey.doorsVisible(0.9, false), false);
  assert.equal(journey.doorsVisible(0.99, true), true);
  assert.equal(journey.doorsVisible(1, true), false);
  assert.equal(journey.doorsVisible(1.9, true), false);
});

test('journey store notifies only on changes and releases every subscription', () => {
  const store = journey.createJourneyProgress();
  let calls = 0;
  const off = store.subscribe(() => { calls++; });
  store.publish(0.5); store.publish(0.5);
  assert.equal(calls, 1);
  assert.equal(store.getSnapshot(), 0.5);
  store.publish(99); assert.equal(store.getSnapshot(), 1.9);
  off(); store.publish(0); assert.equal(calls, 2);
});

test('damping only smooths the visual target, is frame-rate independent, and settles exactly for a replay', () => {
  let at60 = 0, at120 = 0;
  for (let i = 0; i < 60; i++) at60 = journey.smoothScreens(at60, 1.9, 1 / 60);
  for (let i = 0; i < 120; i++) at120 = journey.smoothScreens(at120, 1.9, 1 / 120);
  near(at60, at120);
  for (let i = 0; i < 120; i++) at60 = journey.smoothScreens(at60, 1.9, 1 / 60);
  assert.equal(at60, 1.9);
  assert.equal(journey.smoothScreens(0.5, 1.4, 0), 1.4, 'static paints snap instead of freezing between cuts');
});
