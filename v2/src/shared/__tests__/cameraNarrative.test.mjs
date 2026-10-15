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
const { groupJourneyChapters } = await import(urls.chapters);

const request = (state, target, now = 100) => transitionReducer(state, { type: 'request', target, now });
const tick = (state, now) => transitionReducer(state, { type: 'tick', now });
const within = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);
const settle = state => tick(state, state.startedAt + transitionTimeline(state.mode, state.kind).totalMs);
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

test('homepage drift preserves the original phone and desktop pace at 30/60/120 Hz', async () => {
  const { driftHomeCamera } = await import(urls.camera);
  for (const phone of [false, true]) for (const hz of [30, 60, 120]) {
    let alpha = -1.5;
    for (let i = 0; i < hz * 10; i++) alpha = driftHomeCamera(alpha, 1 / hz, phone);
    assert.ok(Math.abs(alpha - (-1.5 + (phone ? 0.00035 : 0.00060) * 600)) < 1e-10);
  }
});
