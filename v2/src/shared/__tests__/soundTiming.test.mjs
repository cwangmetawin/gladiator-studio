import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from './sourceModule.mjs';
import { motionModuleUrls } from './motionModuleUrls.mjs';
import { soundModuleUrls } from './soundModuleUrls.mjs';
import { audioRecorder } from './audioRecorder.mjs';

const motion = motionModuleUrls(moduleUrl, source, moduleUrl(source('../utils/frameTime.ts')));
const urls = soundModuleUrls(moduleUrl, source, { tokens: motion.tokens });
const { createWinThrottle } = await import(urls.throttle);
const { createMuteStore, MUTE_STORAGE_KEY } = await import(urls.mute);
const { bindTransitionSounds, createClientAreaSounds, createCatalogueLock } = await import(urls.transition);
const { createTransitionStore } = await import(motion.store);
const { transitionTimeline } = await import(motion.tokens);

function fakeClock(start = 0) {
  let now = start, id = 0;
  const tasks = new Map();
  const clock = {
    now: () => now,
    schedule(callback, delay) { const token = ++id; tasks.set(token, { callback, at: now + delay }); return token; },
    cancel: token => tasks.delete(token),
    advance(at) {
      for (;;) {
        const next = [...tasks].filter(([, task]) => task.at <= at).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        tasks.delete(next[0]); now = next[1].at; next[1].callback();
      }
      now = at;
    },
  };
  return clock;
}

test('ten wins over one second play at most three cues; two big wins in one second play once', () => {
  const allow = createWinThrottle();
  assert.equal(Array.from({ length: 10 }, (_, i) => allow('alert', i * 1000 / 9)).filter(Boolean).length, 3);
  const allowBig = createWinThrottle();
  assert.equal(allowBig('bigWin', 0), true);
  assert.equal(allowBig('bigWin', 999), false);
  assert.equal(allowBig('bigWin', 2999), false);
  assert.equal(allowBig('bigWin', 3000), true);
  const mixed = createWinThrottle();
  assert.equal(mixed('bigWin', 0), true);
  assert.equal(mixed('alert', 399), false);
  assert.equal(mixed('alert', 400), true);
  assert.equal(mixed('bigWin', 800), false);
});

test('one transition produces exactly one open cue at panelAtMs; switching has one cue and close starts immediately', () => {
  const clock = fakeClock(1000);
  const store = createTransitionStore(clock);
  const played = [];
  const unsubscribe = bindTransitionSounds(store, {
    panelOpen: () => played.push(['open', clock.now()]),
    panelClose: () => played.push(['close', clock.now()]),
    sectionSwitch: () => played.push(['switch', clock.now()]),
  });
  store.request('about'); store.request('about');
  const arrival = 1000 + transitionTimeline('desktop', 'open').panelAtMs;
  clock.advance(arrival - 1); assert.deepEqual(played, []);
  clock.advance(arrival); assert.deepEqual(played, [['open', arrival]]);
  clock.advance(2000); assert.equal(played.length, 1);
  store.request('contact');
  clock.advance(2000 + transitionTimeline('desktop', 'switch').panelAtMs);
  assert.deepEqual(played[1], ['switch', 2420]);
  clock.advance(3000); store.request('none');
  assert.deepEqual(played[2], ['close', 3000]);
  clock.advance(4000); assert.equal(played.length, 3);
  unsubscribe(); store.request('team'); clock.advance(6000);
  assert.equal(played.length, 3);
});

test('rapid requests cancel old arrivals; resize / reduced-motion configuration cannot duplicate a cue', () => {
  const clock = fakeClock();
  const store = createTransitionStore(clock);
  const cues = [];
  bindTransitionSounds(store, {
    panelOpen: () => cues.push(['open', store.getSnapshot().target, clock.now()]),
    panelClose: () => cues.push(['close', clock.now()]), sectionSwitch: () => cues.push(['switch', clock.now()]),
  });
  for (let i = 0; i < 10; i++) { clock.advance(i * 25); store.request(i % 2 ? 'team' : 'about'); }
  clock.advance(724); assert.deepEqual(cues, []);
  clock.advance(725); assert.deepEqual(cues, [['open', 'team', 725]]);
  store.configure('reduced'); clock.advance(1000); assert.equal(cues.length, 1);
  store.request('contact'); assert.deepEqual(cues[1], ['switch', 1000]);
  store.configure('phone'); clock.advance(2000); assert.equal(cues.length, 2);
  store.request('none'); assert.deepEqual(cues[2], ['close', 2000]);
  store.request('games'); clock.advance(2020); store.request('none'); clock.advance(3000);
  assert.equal(cues.filter(cue => cue[0] === 'open').length, 1, 'a cancelled phone flight never opens audibly');
});

test('closing and reopening at the previous arrival timestamp still publishes the next panelAtMs', () => {
  const clock = fakeClock();
  const store = createTransitionStore(clock);
  const played = [];
  bindTransitionSounds(store, {
    panelOpen: () => played.push(['open', clock.now()]),
    panelClose: () => played.push(['close', clock.now()]),
    sectionSwitch: () => played.push(['switch', clock.now()]),
  });
  store.request('about'); clock.advance(500);
  store.request('none'); store.request('about');
  const arrival = 500 + transitionTimeline('desktop', 'switch').panelAtMs;
  clock.advance(arrival - 1); assert.deepEqual(played, [['open', 500], ['close', 500]]);
  clock.advance(arrival); assert.deepEqual(played.at(-1), ['switch', arrival]);
  clock.advance(2000); assert.equal(played.length, 3);
});

test('Client Area plays one tonal open and one close; duplicate or rapid requests cannot add cues', () => {
  const played = [];
  const client = createClientAreaSounds({ warpArrival: () => played.push('open'), panelClose: () => played.push('close') });
  assert.equal(client.close(), false);
  assert.equal(client.open(), true); assert.equal(client.open(), false);
  assert.deepEqual(played, ['open']);
  assert.equal(client.close(), true); assert.equal(client.close(), false);
  client.open(); client.close(); client.open(); client.close();
  assert.deepEqual(played, ['open', 'close', 'open', 'close', 'open', 'close']);
});

test('catalogue lock ticks once for a changed settled game, and does not tick on initial load or resize', () => {
  let ticks = 0;
  const focus = createCatalogueLock(() => ticks++);
  focus.prime('First'); focus.lock('First'); assert.equal(ticks, 0);
  focus.lock('Second'); focus.lock('Second'); assert.equal(ticks, 1);
  focus.lock('First'); assert.equal(ticks, 2);
});

test('mute survives a fresh store and both read/write failures retain a working in-memory toggle', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const first = createMuteStore(() => storage);
  let notifications = 0;
  const unsubscribe = first.subscribe(() => notifications++);
  assert.equal(first.toggle(), true);
  assert.equal(values.get(MUTE_STORAGE_KEY), '1');
  const refreshed = createMuteStore(() => storage);
  assert.equal(refreshed.getSnapshot(), true);
  assert.equal(refreshed.toggle(), false);
  assert.equal(createMuteStore(() => storage).getSnapshot(), false);
  unsubscribe(); first.toggle(); assert.equal(notifications, 1);
  for (const blocked of [
    () => { throw new Error('storage getter blocked'); },
    () => ({ getItem() { throw new Error('read blocked'); }, setItem() { throw new Error('write blocked'); } }),
  ]) {
    const fallback = createMuteStore(blocked);
    assert.equal(fallback.getSnapshot(), false);
    assert.equal(fallback.toggle(), true);
    assert.equal(fallback.toggle(), false);
  }
});

test('the actual engine stays silent before a gesture, shares win throttles, and reuses ambient after mute', async () => {
  const previous = { window: globalThis.window, AudioContext: globalThis.AudioContext, performance: globalThis.performance };
  const chunks = [], listeners = new Map(), values = new Map();
  let now = 0;
  const { AudioContext, record } = audioRecorder();
  globalThis.window = {
    localStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) },
    requestIdleCallback: callback => chunks.push(callback),
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: type => listeners.delete(type),
  };
  globalThis.AudioContext = AudioContext;
  globalThis.performance = { now: () => now };
  let sound;
  try {
    const fresh = soundModuleUrls(moduleUrl, source, { suffix: 'gesture-engine' });
    ({ soundEngine: sound } = await import(fresh.engine));
    const cleanup = sound.initGestureUnlock();
    sound.hover(); sound.alert(); sound.startAmbient();
    assert.equal(record.contexts, 0); assert.equal(chunks.length, 0);
    listeners.get('pointerdown')();
    assert.equal(record.contexts, 1);
    assert.equal(record.buffers.length, 0, 'unlock queues allocation / synthesis, without doing it in the gesture task');
    for (let i = 0; i < 10; i++) { now = i * 1000 / 9; sound.alert(); }
    assert.equal(record.oscillators.length, 6, 'three two-note win cues');
    now = 2000; sound.bigWin(); now = 2500; sound.bigWin();
    assert.equal(record.oscillators.length, 10, 'only one four-note big win');
    sound.startAmbient(); sound.startAmbient();
    assert.equal(record.buffers.length, 0, 'the hand-off cannot synthesize a buffer synchronously');
    while (chunks.length) chunks.shift()();
    await Promise.resolve(); await Promise.resolve();
    assert.equal(record.buffers.length, 2, 'one stereo ambient buffer and one shared mono cue texture');
    assert.equal(record.sources.filter(source => source.started).length, 1);
    const ambient = record.buffers.find(buffer => buffer.numberOfChannels === 2);
    const oscillatorsBeforeMute = record.oscillators.length;
    assert.equal(sound.toggleMute(), true);
    sound.panelOpen(); sound.alert();
    assert.equal(record.oscillators.length, oscillatorsBeforeMute);
    assert.equal(values.get(MUTE_STORAGE_KEY), '1');
    assert.equal(sound.toggleMute(), false);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(record.buffers.length, 2);
    assert.equal(record.sources.at(-1).buffer, ambient, 'unmute reuses the same AudioBuffer');
    assert.equal(chunks.length, 0);
    cleanup(); assert.equal(listeners.size, 0);
  } finally {
    sound?.stopAmbient();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
