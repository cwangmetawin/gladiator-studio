import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from './sourceModule.mjs';
import { soundModuleUrls } from './soundModuleUrls.mjs';
import { audioRecorder } from './audioRecorder.mjs';

test('the real gate handler unlocks and ignites on its first gesture, without a generic click or synchronous synthesis', async () => {
  const previous = { window: globalThis.window, AudioContext: globalThis.AudioContext };
  const chunks = [], { AudioContext, record } = audioRecorder();
  globalThis.window = { localStorage: { getItem: () => null }, requestIdleCallback: callback => chunks.push(callback) };
  globalThis.AudioContext = AudioContext;
  try {
    const urls = soundModuleUrls(moduleUrl, source, { suffix: 'first-ignite' });
    const { soundEngine } = await import(urls.engine), { CUE_NOTES } = await import(urls.key);
    const app = source('../../app/App.tsx');
    const body = app.match(/const handleVerify = useCallback\(\(\) => \{([\s\S]*?)\}, \[verify\]\);/)[1];
    const order = [];
    const handler = new Function('preloadScene', 'soundEngine', 'verify', body);
    handler(() => order.push('warm'), soundEngine, () => order.push('verify'));
    assert.deepEqual(order, ['warm', 'verify']);
    assert.equal(record.contexts, 1);
    assert.equal(record.buffers.length, 0, 'neither idle buffer is made on the click frame');
    assert.deepEqual(record.pitches, CUE_NOTES.ignite.tones.map(pitch => pitch.hz));
    assert.ok(record.oscillators.length > 0, 'the first gesture actually schedules sound');
    handler(() => {}, soundEngine, () => {});
    assert.equal(record.contexts, 1, 'unlock is idempotent');
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});

test('gameSwitch has a shared 180 ms leading throttle, mute suppresses every arena cue and cache synthesis stays idle', async () => {
  const previous = { window: globalThis.window, AudioContext: globalThis.AudioContext, performance: globalThis.performance };
  const chunks = [], { AudioContext, record } = audioRecorder(); let now = 0;
  globalThis.window = { localStorage: { getItem: () => null, setItem() {} }, requestIdleCallback: callback => chunks.push(callback) };
  globalThis.AudioContext = AudioContext; globalThis.performance = { now: () => now };
  try {
    const urls = soundModuleUrls(moduleUrl, source, { suffix: 'arena-throttle' });
    const { soundEngine: sound } = await import(urls.engine);
    sound.unlock(); sound.ignite();
    assert.equal(record.buffers.length, 0);
    while (chunks.length) chunks.shift()();
    await Promise.resolve(); await Promise.resolve();
    const buffers = record.buffers.length, before = record.oscillators.length;
    for (let i = 0; i < 20; i++) { now = i * 10; sound.gameSwitch(); }
    assert.equal(record.oscillators.length - before, 2, 'only t=0 and t=180 ms tick');
    sound.arc(); sound.arc(); assert.equal(record.buffers.length, buffers, 'crackle reuses the prepared buffer');
    const arcSources = record.sources.slice(-3);
    sound.stopArc();
    assert.ok(arcSources.every(source => source.until === 0), 'covering home cuts every scheduled crackle fragment');
    sound.toggleMute();
    const count = record.oscillators.length, sources = record.sources.length;
    now = 1000; sound.ignite(); sound.arc(); sound.crossing(); sound.gameSwitch();
    assert.equal(record.oscillators.length, count); assert.equal(record.sources.length, sources);
    sound.toggleMute(); await Promise.resolve(); sound.stopAmbient();
    assert.equal(record.buffers.length, buffers);
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
