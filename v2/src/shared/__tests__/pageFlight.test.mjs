import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './loadTs.mjs';

const loader = createLoader();
const { createPageGates } = await loader.load('features/arena/pageGates.ts');
const { createPageFlight, samplePageFlight, pageFlightTiming, pageFlightProgress, samplePageScroll } = await loader.load('features/arena/pageFlight.ts');
const keys = ['x', 'y', 'z', 'pitch', 'yaw', 'roll', 'fov'];
const home = { x: -0.2, y: 0.1, z: -8, pitch: 0.02, yaw: 0, roll: 0, fov: 0.84 };
const out = () => ({ x: 0, y: 0, z: 0, pitch: 0, yaw: 0, roll: 0, fov: 0 });
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} / ${b}`);
const samePose = (actual, expected) => keys.forEach(key => assert.equal(actual[key], expected[key], key));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

test('weighted flight starts within 100ms and finishes with readable body inside both device budgets', () => {
  for (const phone of [false, true]) {
    const timing = pageFlightTiming(phone, false), budget = phone ? 1200 : 1500;
    assert.ok(timing.titleAtMs < timing.bodyAtMs);
    assert.equal(timing.titleAtMs, timing.durationMs, 'the title cuts in as the camera settles');
    assert.equal(timing.bodyAtMs, timing.durationMs + 180, 'matches the actual shell reveal');
    assert.ok(timing.bodyAtMs <= budget);
    const path = createPageFlight(home, createPageGates(phone ? 40 : 64)[0], phone);
    const first = out(); samplePageFlight(path, pageFlightProgress(80, timing.durationMs), first);
    assert.ok(distance(home, first) > 0.001, 'camera begins before 100ms');
    assert.equal(pageFlightProgress(timing.durationMs, timing.durationMs), 1);
  }
  assert.deepEqual(pageFlightTiming(false, true), { durationMs: 0, titleAtMs: 0, bodyAtMs: 0 });
  assert.deepEqual(pageFlightTiming(true, true), { durationMs: 0, titleAtMs: 0, bodyAtMs: 0 });
  assert.equal(pageFlightProgress(0, 0), 1, 'reduced motion cuts to resting pose');
});

test('elapsed progress is finite, clamped and monotonic across a stalled or early clock', () => {
  for (const duration of [980, 1280]) {
    let previous = 0;
    for (let elapsed = -100; elapsed <= 1600; elapsed += 5) {
      const current = pageFlightProgress(elapsed, duration);
      assert.ok(Number.isFinite(current) && current >= previous && current <= 1);
      previous = current;
    }
    assert.equal(pageFlightProgress(NaN, duration), 0);
    assert.equal(pageFlightProgress(Infinity, duration), 1);
  }
});

test('all gates have exact owned start/end poses and reusable allocation-free sample output', () => {
  for (const phone of [false, true]) {
    for (const gate of createPageGates(phone ? 40 : 64)) {
      for (const start of [home, { ...home, y: 3.3, z: 15.5 }, { ...home, x: 2, y: 1.8, z: 32.5, yaw: -3.1 }]) {
        const mutableStart = { ...start }, path = createPageFlight(mutableStart, gate, phone), pose = out();
        mutableStart.x += 100;
        samplePageFlight(path, 0, pose); samePose(pose, start);
        samplePageFlight(path, -1, pose); samePose(pose, start);
        samplePageFlight(path, 1, pose); samePose(pose, path.end);
        samplePageFlight(path, 2, pose); samePose(pose, path.end);
        for (let i = 0; i <= 100; i++) {
          const result = samplePageFlight(path, i / 100, pose);
          assert.equal(result, undefined, 'sampler writes into caller-owned storage');
          keys.forEach(key => assert.ok(Number.isFinite(pose[key]), `${gate.id}/${key}`));
        }
        near(path.end.x, gate.restPose.x); near(path.end.y, gate.restPose.y); near(path.end.z, gate.restPose.z);
        near(Math.sin(path.end.yaw), Math.sin(gate.restPose.yaw)); near(Math.cos(path.end.yaw), Math.cos(gate.restPose.yaw));
      }
    }
  }
});

test('paths cross through the selected ground arch inward at eye height with an outside approach', () => {
  for (const phone of [false, true]) {
    for (const gate of createPageGates(phone ? 40 : 64)) {
      for (const start of [home, createPageGates()[5].restPose]) {
        const path = createPageFlight(start, gate, phone), pose = out(), before = out(), after = out();
        samplePageFlight(path, path.gateAt, pose);
        near(pose.x, gate.center[0]); near(pose.y, gate.center[1]); near(pose.z, gate.center[2]);
        samplePageFlight(path, path.gateAt - 0.001, before); samplePageFlight(path, path.gateAt + 0.001, after);
        const radial = p => Math.hypot(p.x, p.z - 34);
        assert.ok(radial(before) > 24 && radial(after) < 24, `${gate.id}: lens sweeps inward through arch`);
        near(Math.sin(pose.yaw), -gate.outward[0]); near(Math.cos(pose.yaw), -gate.outward[2]);
        assert.ok(before.y > gate.floorY && before.y < gate.springY);
      }
    }
  }
});

test('the lens stays within jamb clearance throughout the actual gate depth on both passages', () => {
  for (const phone of [false, true]) {
    for (const gate of createPageGates(phone ? 40 : 64)) {
      const path = createPageFlight(createPageGates()[3].restPose, gate, phone), pose = out();
      const halfWidth = 24 * Math.sin(gate.halfAngle) - 0.18;
      let samplesInsideGate = 0;
      for (let i = 0; i <= 2000; i++) {
        samplePageFlight(path, i / 2000, pose);
        const dx = pose.x - gate.center[0], dz = pose.z - gate.center[2];
        const depth = dx * gate.outward[0] + dz * gate.outward[2];
        if (depth < -0.56 || depth > 1.66) continue;
        const tangent = -dx * gate.outward[2] + dz * gate.outward[0];
        assert.ok(Math.abs(tangent) < halfWidth - 0.1, `${gate.id}: jamb clearance`);
        assert.ok(pose.y > gate.floorY + 0.2 && pose.y < gate.springY - 0.18, `${gate.id}: vertical clearance`);
        samplesInsideGate++;
      }
      assert.ok(samplesInsideGate > 4, 'test sampled real gate thickness');
    }
  }
});

test('position, lens and orientation have continuous first derivatives at every authored join', () => {
  for (const start of [home, createPageGates()[1].restPose]) {
    const path = createPageFlight(start, createPageGates()[6]), epsilon = 0.000001;
    for (const join of path.joins) {
      const left = out(), middle = out(), right = out();
      samplePageFlight(path, join - epsilon, left); samplePageFlight(path, join, middle); samplePageFlight(path, join + epsilon, right);
      keys.forEach(key => {
        const incoming = (middle[key] - left[key]) / epsilon, outgoing = (right[key] - middle[key]) / epsilon;
        assert.ok(Math.abs(incoming - outgoing) < 0.03, `${key}: C1 join ${join}: ${incoming}/${outgoing}`);
      });
    }
    const beginning = out(), ending = out(); samplePageFlight(path, epsilon, beginning); samplePageFlight(path, 1 - epsilon, ending);
    assert.ok(distance(beginning, path.start) / epsilon < 0.03, 'weighted departure starts at rest');
    assert.ok(distance(ending, path.end) / epsilon < 0.03, 'landing settles at rest');
  }
});

test('reverse retraces every pose and a mid-flight interruption starts exactly at the live camera', () => {
  const gates = createPageGates(), first = createPageFlight(home, gates[2]), interrupted = out(), reverse = out(), forward = out();
  for (let i = 0; i <= 100; i++) {
    const progress = i / 100;
    samplePageFlight(first, progress, forward); samplePageFlight(first, 1 - (1 - progress), reverse);
    keys.forEach(key => near(forward[key], reverse[key]));
  }
  samplePageFlight(first, 0.47, interrupted);
  const retarget = createPageFlight(interrupted, gates[7]); samplePageFlight(retarget, 0, forward); samePose(forward, interrupted);
  samplePageFlight(retarget, 1, forward); samePose(forward, retarget.end);
  samplePageFlight(first, 0, reverse); samePose(reverse, home);
});

test('adjacent wrapped yaw poses turn by the short arc and scroll remains quietly inside the arena', () => {
  const gates = createPageGates(), start = { ...gates[4].restPose, yaw: -Math.PI };
  const path = createPageFlight(start, gates[5]), pose = out();
  assert.ok(Math.abs(path.end.yaw - start.yaw) < Math.PI);
  const rest = { ...path.end };
  samplePageScroll(rest, 0, pose); samePose(pose, rest);
  samplePageScroll(rest, 1, pose);
  assert.ok(distance(pose, rest) > 0.1 && distance(pose, rest) < 2, 'scroll adds small spatial parallax');
  assert.ok(Math.hypot(pose.x, pose.z - 34) < 12);
  near(pose.yaw, rest.yaw); near(pose.roll, rest.roll);
  samePose(rest, path.end);
});
