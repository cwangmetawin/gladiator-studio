import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from '../../../shared/__tests__/sourceModule.mjs';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';
import { createClock, createHarness, harnessHooksUrl } from '../../../shared/__tests__/hookHarness.mjs';

const { urlOf } = createLoader();
const hooks = harnessHooksUrl(moduleUrl);
const { usePartnerCovers } = await import(moduleUrl(source('../../features/partner/usePartnerCovers.ts')
  .replace("from 'react'", `from '${hooks}'`)
  .replace("from '@/features/arena/hallActions'", `from '${urlOf('features/arena/hallActions.ts')}'`)));

function rig() {
  const saved = { window: globalThis.window, fetch: globalThis.fetch }, clock = createClock(), calls = [];
  globalThis.window = clock;
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    calls.push({ url, options, resolve, reject });
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  });
  const harness = createHarness(usePartnerCovers);
  harness.mount();
  return { harness, clock, calls, async flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); harness.act(() => {}); },
    restore() { harness.unmount(); for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } } };
}

test('the real manifest request is same-origin, starts once, leaves text ready and clears its deadline on success', async () => {
  const r = rig();
  try {
    assert.deepEqual(r.harness.output, { manifest: null, ready: false });
    assert.equal(r.calls[0].url, '/arena/games/manifest.json');
    assert.equal(r.calls[0].options.credentials, 'same-origin');
    r.harness.act(() => {});
    assert.equal(r.calls.length, 1);
    r.calls[0].resolve({ ok: true, json: async () => ({ version: 1, entries: {} }) });
    await r.flush();
    assert.equal(r.harness.output.ready, true);
    assert.deepEqual(Object.keys(r.harness.output.manifest.entries), []);
    assert.deepEqual(r.clock.pending, []);
  } finally { r.restore(); }
});

test('a four-second timeout or failed/invalid manifest releases the catalogue-image fallback', async () => {
  for (const failure of ['timeout', 'offline', 'invalid', 'missing']) {
    const r = rig();
    try {
      if (failure === 'timeout') {
        r.clock.advance(3999); assert.equal(r.calls[0].options.signal.aborted, false);
        r.clock.advance(1); assert.equal(r.calls[0].options.signal.aborted, true);
      } else if (failure === 'offline') r.calls[0].reject(new Error('offline'));
      else r.calls[0].resolve({ ok: failure !== 'missing', json: async () => ({ bad: 'manifest' }) });
      await r.flush();
      assert.deepEqual(r.harness.output, { manifest: null, ready: true }, failure);
      assert.deepEqual(r.clock.pending, []);
    } finally { r.restore(); }
  }
});

test('closing aborts the pending request, clears its timer and ignores a late response', async () => {
  const r = rig();
  try {
    r.harness.unmount();
    assert.equal(r.calls[0].options.signal.aborted, true);
    assert.deepEqual(r.clock.pending, []);
    r.calls[0].resolve({ ok: true, json: async () => ({ version: 1, entries: {} }) });
    await r.flush();
    assert.deepEqual(r.harness.output, { manifest: null, ready: false });
    assert.equal(r.calls.length, 1);
  } finally { r.restore(); }
});
