// npm run test:unit; mutations only affect these transpiled copies, never app code.
// MUTATE_CAMERA_NARRATIVE=1 restores the open-ended camera approach (red).
// MUTATE_PANEL_NARRATIVE=1 restores immediate panel selection (red).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { motionModuleUrls } from './motionModuleUrls.mjs';

const require = createRequire(new URL('../../../package.json', import.meta.url));
const ts = require('typescript');
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const moduleUrl = src => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(src, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText).toString('base64')}`;
const timeUrl = moduleUrl(source('../utils/frameTime.ts'));
const urls = motionModuleUrls(moduleUrl, source, timeUrl, {
  mutateCamera: process.env.MUTATE_CAMERA_NARRATIVE === '1',
  mutatePanel: process.env.MUTATE_PANEL_NARRATIVE === '1',
});
const { motionTokens, transitionTimeline } = await import(urls.tokens);
const { initialTransition, transitionReducer, nextTransitionDeadline, isPanelId } = await import(urls.transition);
const { createTransitionStore } = await import(urls.store);
const { createCameraTween, sampleCameraTween, approachCameraPose } = await import(urls.tween);
const { createCameraNarrative, panelCameraPose } = await import(urls.camera);
const { JOURNEY_CHAPTERS, groupJourneyChapters, journeyChapterAt, journeyCameraPose } = await import(urls.chapters);
const { createJourneyMotion } = await import(urls.journey);
const { frameDeltaSeconds, approachRate } = await import(timeUrl);

const request = (state, target, now = 100) => transitionReducer(state, { type: 'request', target, now });
const tick = (state, now) => transitionReducer(state, { type: 'tick', now });
const settle = state => tick(state, state.startedAt + transitionTimeline(state.mode, state.kind).totalMs);
const within = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const poseWithin = (actual, expected, tolerance = 1e-9) => {
  for (const key of Object.keys(expected)) {
    const error = key === 'alpha' ? Math.atan2(Math.sin(actual[key] - expected[key]), Math.cos(actual[key] - expected[key])) : actual[key] - expected[key];
    within(error, 0, tolerance, key);
  }
};
const HOME = Object.freeze({ alpha: -1.5, beta: 1.2, radius: 30, x: 0, y: 0, z: 0, screenX: 0 });
const PLANET = Object.freeze({ x: 29.7, y: -6, z: 4.2, radius: 13.65 });
const targetPose = id => panelCameraPose(id, HOME, PLANET);

test('open waits for camera arrival, then exposes the full panel at the deadline', () => {
  const idle = initialTransition();
  const flying = request(idle, 'about');
  assert.equal(idle.phase, 'idle', 'the reducer never mutates its input');
  assert.equal(flying.phase, 'flying');
  assert.equal(flying.target, 'about');
  assert.equal(flying.previousTarget, 'none');
  assert.equal(flying.panel, 'none', 'panel cannot precede the camera');
  const arrival = flying.startedAt + transitionTimeline('desktop', 'open').panelAtMs;
  assert.equal(tick(flying, arrival - 1).panel, 'none');
  const entering = tick(flying, arrival);
  assert.equal(entering.panel, 'about');
  assert.equal(entering.phase, 'flying');
  assert.equal(entering.panelStartedAt, arrival);
  assert.equal(settle(entering).phase, 'open');
  assert.equal(settle(entering).panel, 'about');
});

test('close exits the panel first, returns the camera, and only then restores the hub', () => {
  const open = settle(request(initialTransition(), 'team'));
  const closing = request(open, 'none', 1000);
  const t = transitionTimeline('desktop', 'close');
  assert.equal(closing.phase, 'closing');
  assert.equal(closing.panel, 'team');
  assert.equal(closing.previousTarget, 'team');
  assert.equal(closing.hubVisible, false);
  assert.equal(t.cameraAtMs, t.exitMs);
  assert.equal(tick(closing, 1000 + t.hubAtMs - 1).hubVisible, false);
  assert.equal(tick(closing, 1000 + t.hubAtMs).hubVisible, true);
  const idle = settle(closing);
  assert.equal(idle.phase, 'idle');
  assert.equal(idle.panel, 'none');
  assert.equal(idle.target, 'none');
});

test('switch retains the presented content until the new camera arrives', () => {
  const open = settle(request(initialTransition(), 'about'));
  const switching = request(open, 'contact', 1000);
  const t = transitionTimeline('desktop', 'switch');
  assert.equal(switching.kind, 'switch');
  assert.equal(switching.panel, 'about');
  assert.equal(switching.previousTarget, 'about');
  assert.equal(tick(switching, 1000 + t.panelAtMs - 1).panel, 'about');
  assert.equal(tick(switching, 1000 + t.panelAtMs).panel, 'contact');
  assert.equal(settle(switching).panel, 'contact');
  assert.equal(settle(switching).phase, 'open');
});

test('mid-flight retarget and a ten-click burst always settle on the last request', () => {
  let state = request(initialTransition(), 'about');
  state = request(tick(state, 260), 'journey', 260);
  assert.equal(state.previousTarget, 'about');
  assert.equal(state.startedAt, 260);
  assert.equal(settle(state).panel, 'journey');
  const burst = ['about', 'team', 'journey', 'live', 'games', 'contact', 'careers', 'team', 'about', 'contact'];
  state = initialTransition();
  for (const [i, id] of burst.entries()) state = request(tick(state, 100 + i * 50), id, 100 + i * 50);
  assert.equal(state.revision, 10);
  assert.equal(state.target, burst.at(-1));
  assert.equal(settle(state).panel, burst.at(-1));
});

test('close during flight and reopening during close cannot resurrect cancelled content', () => {
  const flight = request(initialTransition(), 'journey');
  const closed = request(tick(flight, 220), 'none', 220);
  assert.equal(closed.phase, 'closing');
  assert.equal(closed.panel, 'none');
  assert.equal(settle(closed).phase, 'idle');
  assert.equal(settle(closed).panel, 'none');
  const open = settle(request(initialTransition(), 'about'));
  const closing = request(open, 'none', 1000);
  const reopened = request(tick(closing, 1060), 'about', 1060);
  assert.equal(reopened.panel, 'about');
  assert.equal(reopened.phase, 'flying');
  assert.equal(settle(reopened).target, 'about');
  assert.equal(settle(reopened).phase, 'open');
});

test('phone transitions have no camera work; reduced motion selects full content and settles within 150 ms', () => {
  for (const mode of ['phone', 'reduced']) {
    const open = request(initialTransition(mode), 'journey');
    const t = transitionTimeline(mode, 'open');
    assert.equal(t.cameraMs, 0);
    assert.ok(t.feedbackMs <= 100);
    assert.equal(t.bodyDelayMs, 0);
    assert.equal(t.revealMs, 0);
    assert.equal(settle(open).panel, 'journey');
    if (mode === 'reduced') {
      assert.equal(open.panel, 'journey');
      assert.ok(t.totalMs <= 150);
      assert.ok(transitionTimeline(mode, 'close').totalMs <= 150);
    } else assert.equal(open.panel, 'none');
  }
  const flying = request(initialTransition(), 'about');
  const reduced = transitionReducer(flying, { type: 'configure', mode: 'reduced', now: 220 });
  assert.equal(reduced.panel, 'about');
  assert.equal(reduced.revision, flying.revision + 1);
  assert.equal(settle(reduced).phase, 'open');
  assert.equal(isPanelId('cosmos'), false);
  assert.equal(isPanelId('journey'), true);
});

test('every desktop transition fits 600–900 ms and all reveals finish within its budget', () => {
  assert.ok(motionTokens.feedbackMs <= 100);
  for (const kind of ['open', 'switch', 'close']) {
    const t = transitionTimeline('desktop', kind);
    assert.ok(t.totalMs >= 600 && t.totalMs <= 900, `${kind}: ${t.totalMs} ms`);
    if (kind === 'close') {
      assert.equal(t.hubAtMs, t.cameraAtMs + t.cameraMs);
      assert.equal(t.totalMs, t.hubAtMs + t.hubMs);
    } else {
      assert.equal(t.panelAtMs, t.cameraAtMs + t.cameraMs);
      assert.ok(t.eyebrowDelayMs < t.titleDelayMs && t.titleDelayMs < t.bodyDelayMs);
      assert.ok(t.panelAtMs + t.frameMs <= t.totalMs);
      assert.equal(t.panelAtMs + t.bodyDelayMs + t.revealMs, t.totalMs);
    }
    for (const hz of [30, 60, 120]) {
      const start = kind === 'open' ? initialTransition() : settle(request(initialTransition(), 'about'));
      let state = request(start, kind === 'close' ? 'none' : 'contact', 1000);
      let elapsed = 0;
      while (state.phase === 'flying' || state.phase === 'closing') {
        elapsed += 1000 / hz;
        state = tick(state, 1000 + elapsed);
      }
      within(elapsed, t.totalMs, t.totalMs * 0.05, `${kind}, ${hz} Hz`);
    }
  }
});

test('the external store publishes boundaries and ignores already-queued callbacks after retargeting', () => {
  let now = 100;
  const pending = [];
  const store = createTransitionStore({ now: () => now, schedule: (callback, delay) => {
    const timer = { callback, due: now + delay }; pending.push(timer); return timer;
  }, cancel: () => {} }); // Intentionally let stale callbacks execute.
  const changes = [];
  const dispose = store.subscribe(() => changes.push(store.getSnapshot()));
  store.request('about');
  const stale = pending.at(-1);
  now = 220;
  store.request('contact');
  const latest = pending.at(-1);
  now = stale.due;
  stale.callback();
  assert.equal(store.getSnapshot().panel, 'none');
  assert.equal(changes.length, 2);
  now = latest.due;
  latest.callback();
  assert.equal(store.getSnapshot().panel, 'contact');
  assert.equal(store.getSnapshot().phase, 'flying');
  const end = pending.at(-1);
  now = end.due;
  end.callback();
  assert.equal(store.getSnapshot().phase, 'open');
  assert.equal(nextTransitionDeadline(store.getSnapshot()), null);
  const count = changes.length;
  dispose();
  store.request('none');
  assert.equal(changes.length, count);
});

test('the camera reaches every target at its duration at 30/60/120 Hz within 5%', () => {
  for (const id of ['about', 'team', 'journey', 'live', 'careers', 'contact', 'games', 'none']) {
    const from = { ...HOME, alpha: -0.5, x: -4, y: 2, z: -2, radius: 36, screenX: 2 };
    const to = targetPose(id);
    const flight = createCameraTween(from, to, 1000, motionTokens.flightMs);
    poseWithin(sampleCameraTween(flight, 1000), from);
    poseWithin(sampleCameraTween(flight, 1000 + motionTokens.flightMs), to);
    for (const hz of [30, 60, 120]) {
      let elapsed = 0;
      while (elapsed < motionTokens.flightMs) elapsed += frameDeltaSeconds(1000 / hz) * 1000;
      within(elapsed, motionTokens.flightMs, motionTokens.flightMs * 0.05, `${id}, ${hz} Hz arrival`);
      poseWithin(sampleCameraTween(flight, 1000 + elapsed), to);
    }
  }
});

test('camera retarget captures the current pose without shared mutation, and takes the shortest orbit', () => {
  const from = { ...HOME };
  const flight = createCameraTween(from, targetPose('about'), 100, motionTokens.flightMs);
  from.x = 999;
  assert.equal(flight.from.x, HOME.x);
  const current = sampleCameraTween(flight, 310);
  const redirected = createCameraTween(current, targetPose('journey'), 310, motionTokens.flightMs);
  poseWithin(sampleCameraTween(redirected, 310), current);
  poseWithin(sampleCameraTween(redirected, 730), targetPose('journey'));
  const nearTurn = { ...HOME, alpha: Math.PI * 2 - 0.05 };
  const acrossTurn = createCameraTween(nearTurn, { ...HOME, alpha: 0.05 }, 0, 420);
  within(acrossTurn.to.alpha - acrossTurn.from.alpha, 0.1, 1e-9, 'shortest arc');
  const scrub = approachCameraPose(nearTurn, { ...HOME, alpha: 0.05 }, approachRate(0.10), 1 / 60);
  assert.ok(scrub.alpha > nearTurn.alpha && scrub.alpha - nearTurn.alpha < 0.1);
});

test('the real camera adapter follows bursts, close interrupts and drift without a discontinuity', () => {
  let pose = { ...HOME };
  const adapter = createCameraNarrative({ read: () => pose, write: next => { pose = next; }, target: targetPose,
    journey: () => ({ progress: 0, count: 3 }) });
  let state = initialTransition();
  let now = 100;
  adapter.sync(state);
  for (const id of ['about', 'team', 'journey', 'live', 'games', 'careers', 'contact', 'team', 'about', 'contact']) {
    state = request(tick(state, now), id, now);
    const current = { ...pose };
    adapter.sync(state);
    adapter.update(state, now, 0);
    poseWithin(pose, current);
    now += 100;
    adapter.update(state, now, 0.1);
  }
  const arrival = state.startedAt + transitionTimeline(state.mode, state.kind).panelAtMs;
  state = tick(state, arrival);
  adapter.update(state, arrival, 1 / 60);
  poseWithin(pose, targetPose('contact'));
  const settledPose = { ...pose };
  adapter.update(state, arrival + 1000 / 60, 1 / 60);
  within(pose.alpha - settledPose.alpha, 0.024 / 60, 1e-9, 'drift resumes at arrival');
  state = request(state, 'none', arrival + 50);
  adapter.sync(state);
  const exitPose = { ...pose };
  adapter.update(state, state.startedAt + 159, 1 / 60);
  poseWithin(pose, exitPose);
  const returningAt = state.startedAt + transitionTimeline('desktop', 'close').hubAtMs;
  adapter.update(tick(state, returningAt), returningAt, 1 / 60);
  poseWithin(pose, HOME);
});

test('phone camera requests do no work and reduced motion paints one target with no later scrub', () => {
  for (const mode of ['phone', 'reduced']) {
    let pose = { ...HOME };
    let writes = 0;
    const adapter = createCameraNarrative({ read: () => pose, write: next => { pose = next; writes++; },
      target: targetPose, journey: () => ({ progress: 1, count: 3 }) });
    const state = request(initialTransition(mode), 'journey');
    adapter.sync(state);
    const initialWrites = writes;
    for (let i = 0; i < 120; i++) adapter.update(settle(state), 1000 + i * 1000 / 60, 1 / 60);
    assert.equal(writes, initialWrites);
    if (mode === 'phone') { assert.equal(writes, 0); poseWithin(pose, HOME); }
    else { assert.equal(writes, 1); poseWithin(pose, targetPose('journey')); }
  }
  let phoneWrites = 0;
  const phoneReduced = createCameraNarrative({ read: () => HOME, write: () => { phoneWrites++; },
    target: targetPose, journey: () => ({ progress: 1, count: 3 }), isPhone: () => true });
  const state = request(initialTransition('reduced'), 'journey');
  phoneReduced.sync(state);
  phoneReduced.update(settle(state), 1000, 1 / 60);
  assert.equal(phoneWrites, 0, 'reduced motion on a phone also skips static camera retargeting');
});

test('default Journey has three nonempty chapters; arbitrary back-office ordering is preserved', () => {
  const { milestones } = JSON.parse(source('../../api/journeyDefault.json'));
  const chapters = groupJourneyChapters(milestones);
  assert.ok(chapters.length >= 3);
  assert.ok(chapters.every(chapter => chapter.milestones.length > 0));
  assert.deepEqual(chapters.flatMap(chapter => chapter.milestones), milestones);
  assert.equal(new Set(chapters.map(chapter => chapter.label)).size, 3);
  for (const count of [0, 1, 2, 3, 5, 17]) {
    const content = Array.from({ length: count }, (_, i) => ({ date: `custom ${i}`, title: `row ${i}` }));
    assert.deepEqual(groupJourneyChapters(content).flatMap(chapter => chapter.milestones), content);
  }
});

test('chapter mapping is monotonic, reversible and has distinct orbit, position and framing', () => {
  const progress = Array.from({ length: 101 }, (_, i) => i / 100);
  const forward = progress.map(p => journeyChapterAt(p));
  assert.equal(forward[0], 0);
  assert.equal(forward.at(-1), 2);
  assert.deepEqual([...new Set(forward)], [0, 1, 2]);
  assert.ok(forward.every((chapter, i) => i === 0 || chapter >= forward[i - 1]));
  assert.deepEqual([...progress].reverse().map(p => journeyChapterAt(p)), [...forward].reverse());
  const base = targetPose('journey');
  const poses = [0, 0.5, 1].map(p => journeyCameraPose(base, p));
  assert.equal(new Set(poses.map(p => p.alpha)).size, JOURNEY_CHAPTERS.length);
  assert.equal(new Set(poses.map(p => `${p.x},${p.y},${p.z}`)).size, JOURNEY_CHAPTERS.length);
  assert.equal(new Set(poses.map(p => p.screenX)).size, JOURNEY_CHAPTERS.length);
  poseWithin(journeyCameraPose(base, 0), base);
  const forwardPoses = progress.map(p => journeyCameraPose(base, p));
  assert.deepEqual([...progress].reverse().map(p => journeyCameraPose(base, p)), [...forwardPoses].reverse());
  assert.equal(journeyChapterAt(-1), 0);
  assert.equal(journeyChapterAt(2), 2);
  assert.equal(journeyChapterAt(Number.NaN), 0);
});

test('reopening a scrolled Journey during close flies to its retained chapter pose', () => {
  let progress = 0;
  let pose = { ...HOME };
  const adapter = createCameraNarrative({ read: () => pose, write: next => { pose = next; }, target: targetPose,
    journey: () => ({ progress, count: 3 }) });
  let state = request(initialTransition(), 'journey');
  adapter.sync(state);
  adapter.update(state, 600, 1 / 60);
  state = settle(state);
  progress = 1;
  for (let frame = 0; frame < 120; frame++) adapter.update(state, 1000 + frame * 1000 / 60, 1 / 60);
  state = request(state, 'none', 3100);
  adapter.sync(state);
  adapter.update(state, 3300, 1 / 60);
  state = request(state, 'journey', 3300);
  const current = { ...pose };
  adapter.sync(state);
  adapter.update(state, 3300, 0);
  poseWithin(pose, current);
  const t = transitionTimeline(state.mode, state.kind);
  adapter.update(tick(state, 3300 + t.panelAtMs), 3300 + t.panelAtMs, 1 / 60);
  poseWithin(pose, journeyCameraPose(targetPose('journey'), 1));
  assert.equal(settle(state).panel, 'journey');
});

test('Journey scrub converges and scroll back restores the earlier pose at 30/60/120 Hz', () => {
  for (const hz of [30, 60, 120]) {
    let progress = 0;
    let pose = targetPose('journey');
    const adapter = createCameraNarrative({ read: () => pose, write: next => { pose = next; }, target: targetPose,
      journey: () => ({ progress, count: 3 }) });
    let state = request(initialTransition(), 'journey');
    adapter.sync(state);
    adapter.update(state, 600, 1 / hz);
    state = settle(state);
    progress = 1;
    for (let frame = 0; frame < hz * 2; frame++) adapter.update(state, 1000 + frame * 1000 / hz, 1 / hz);
    poseWithin(pose, journeyCameraPose(targetPose('journey'), 1), 0.02);
    progress = 0;
    for (let frame = 0; frame < hz * 2; frame++) adapter.update(state, 3000 + frame * 1000 / hz, 1 / hz);
    poseWithin(pose, journeyCameraPose(targetPose('journey'), 0), 0.02);
  }
  const journey = createJourneyMotion();
  journey.setProgress(1);
  assert.equal(journey.getSnapshot().chapter, 2);
  journey.setProgress(0);
  assert.equal(journey.getSnapshot().chapter, 0);
  journey.setCount(2);
  journey.setProgress(0.75);
  assert.equal(journey.getSnapshot().chapter, 1);
});

test('Journey publishes React snapshots only at chapter boundaries while the camera reads every scroll sample', () => {
  const journey = createJourneyMotion();
  const initial = journey.getChapterSnapshot();
  let updates = 0;
  const dispose = journey.subscribe(() => { updates++; });
  for (const progress of [0.01, 0.04, 0.1, 0.2, 0.3]) journey.setProgress(progress);
  assert.equal(updates, 0);
  assert.equal(journey.getSnapshot().progress, 0.3);
  assert.equal(journey.getChapterSnapshot(), initial);
  journey.setProgress(0.5);
  journey.setProgress(0.8);
  assert.equal(updates, 2);
  journey.setProgress(0);
  assert.equal(updates, 3);
  assert.equal(journey.getChapterSnapshot().chapter, 0);
  dispose();
  journey.setProgress(1);
  assert.equal(updates, 3);
});
