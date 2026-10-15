import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';

const data = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const { load } = createLoader({
  './arenaCore': data(''),
  '@babylonjs/core/Materials/Textures/Loaders/envTextureLoader.js': data(''),
});
const { preloadArena, loadEmblemAsset } = await load('features/arena/arenaAssets.ts');

test('speculative emblem, environment and maps are low-priority, memoised, same-origin fetches', async () => {
  const original = { fetch: globalThis.fetch, window: globalThis.window };
  const requests = [];
  const bytes = readFileSync(new URL('../../../../public/arena/emblem.bin', import.meta.url));
  globalThis.window = {};
  globalThis.fetch = async (url, options) => {
    requests.push({ url, priority: options?.priority });
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  };
  try {
    preloadArena();
    await loadEmblemAsset();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(requests.length, 4);
    assert.ok(requests.every(request => request.priority === 'low'));
    assert.ok(requests.every(request => request.url.startsWith('/arena/')));
    preloadArena(); await loadEmblemAsset();
    assert.equal(requests.length, 4);
  } finally { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});
