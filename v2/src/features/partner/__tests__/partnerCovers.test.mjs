import test from 'node:test';
import assert from 'node:assert/strict';
import { createLoader } from '../../../shared/__tests__/loadTs.mjs';
import { moduleUrl } from '../../../shared/__tests__/sourceModule.mjs';
import { createClock, createHarness, harnessHooksUrl } from '../../../shared/__tests__/hookHarness.mjs';

const { load } = createLoader({ react: harnessHooksUrl(moduleUrl) });
const { usePartnerCovers } = await load('features/partner/usePartnerCovers.ts');
const { coverForGame } = await load('features/arena/hallManifest.ts');

test('Client Area covers are ready on the first render with no fetch, timeout or deferred state', () => {
  const saved = { window: globalThis.window, fetch: globalThis.fetch }, clock = createClock(), calls = [];
  globalThis.window = clock;
  globalThis.fetch = (...args) => { calls.push(args); return new Promise(() => {}); };
  const harness = createHarness(usePartnerCovers);
  try {
    harness.mount();
    const initial = harness.output;
    assert.equal(initial.ready, true);
    assert.equal(Object.keys(initial.manifest.entries).length, 38);
    const [slug, entry] = Object.entries(initial.manifest.entries)[0];
    assert.equal(coverForGame({ slug, image: entry.source }, initial.manifest, true).url, entry.widths['320'].url);
    harness.act(() => clock.advance(5000));
    assert.equal(harness.output.manifest === initial.manifest, true);
    assert.equal(harness.output.ready, true);
    harness.unmount();
    assert.deepEqual(calls, []);
    assert.deepEqual(clock.pending, []);
  } finally {
    harness.unmount();
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
