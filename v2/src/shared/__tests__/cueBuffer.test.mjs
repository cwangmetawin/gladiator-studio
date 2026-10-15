import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from './loadTs.mjs';
import { audioRecorder } from './audioRecorder.mjs';
const { createCueBufferCache, CUE_NOISE_CHUNK_FRAMES } = await createLoader().load('shared/audio/cueBuffer.ts');

test('cue noise allocates off the gesture, fills bounded chunks and is shared by every subsequent cue', async () => {
  const chunks = [], cache = createCueBufferCache(callback => chunks.push(callback));
  const { AudioContext, record } = audioRecorder(), ac = new AudioContext();
  const pending = cache.prepare(ac);
  assert.equal(cache.prepare(ac), pending); assert.equal(cache.get(), null); assert.equal(record.buffers.length, 0);
  chunks.shift()();
  const data = record.buffers[0].getChannelData(0);
  assert.ok(data.slice(0, CUE_NOISE_CHUNK_FRAMES).some(value => value !== 0));
  assert.ok(data.slice(CUE_NOISE_CHUNK_FRAMES).every(value => value === 0));
  while (chunks.length) chunks.shift()();
  assert.equal(cache.get(), await pending); assert.equal(await cache.prepare(ac), cache.get());
  assert.equal(record.buffers.length, 1);
});
