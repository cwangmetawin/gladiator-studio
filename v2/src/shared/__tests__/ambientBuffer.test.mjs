import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from './sourceModule.mjs';
import { soundModuleUrls } from './soundModuleUrls.mjs';
import { audioRecorder } from './audioRecorder.mjs';

const urls = soundModuleUrls(moduleUrl, source);
const { createAmbientBufferCache, AMBIENT_CHUNK_FRAMES, AMBIENT_SECONDS } = await import(urls.ambient);
const { CUE_NOTES } = await import(urls.key);

test('ambient preparation yields every bounded chunk, caches once, and uses the real exact-key drone samples', async () => {
  const chunks = [];
  const cache = createAmbientBufferCache(callback => chunks.push(callback));
  const { AudioContext, record } = audioRecorder();
  const ac = new AudioContext();
  const first = cache.prepare(ac);
  assert.equal(cache.prepare(ac), first);
  assert.equal(record.buffers.length, 0);
  assert.equal(chunks.length, 1);
  const oldRandom = Math.random;
  Math.random = () => 0.5; // Remove noise to verify the shipped tonal sample formula.
  try {
    chunks.shift()();
    assert.equal(record.buffers.length, 1);
    const data = record.buffers[0].getChannelData(0);
    assert.ok(data.slice(1, AMBIENT_CHUNK_FRAMES).some(value => value !== 0));
    assert.ok(data.slice(AMBIENT_CHUNK_FRAMES).every(value => value === 0), 'a callback cannot fill the full eight-second buffer');
    let calls = 1;
    while (chunks.length) { chunks.shift()(); calls++; }
    const buffer = await first;
    assert.equal(calls, Math.ceil(ac.sampleRate * AMBIENT_SECONDS / AMBIENT_CHUNK_FRAMES));
    assert.equal(buffer.numberOfChannels, 2);
    assert.equal(buffer.length, ac.sampleRate * AMBIENT_SECONDS);
    const [bass, fifth, shimmer] = CUE_NOTES.ambient.tones;
    for (const i of [1234, 12345, 54321]) {
      const t = i / ac.sampleRate;
      const expected = Math.sin(2 * Math.PI * bass.hz * t) * 0.03
        + Math.sin(2 * Math.PI * fifth.hz * t) * (0.018 + Math.sin(t * 0.3) * 0.002)
        + Math.sin(2 * Math.PI * shimmer.hz * t) * Math.sin(t * 0.5) * 0.008;
      assert.ok(Math.abs(data[i] - expected) < 1e-8, 'amplitude modulation must not detune the actual drone');
    }
    assert.equal(Math.abs(data[0]), 0); assert.equal(Math.abs(data.at(-1)), 0, 'loop seam is faded to avoid a click');
    assert.equal(await cache.prepare(ac), buffer);
    assert.equal(record.buffers.length, 1); assert.equal(chunks.length, 0);
  } finally { Math.random = oldRandom; }
});
