import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from '../../../shared/__tests__/sourceModule.mjs';
import { motionModuleUrls } from '../../../shared/__tests__/motionModuleUrls.mjs';
import { soundModuleUrls } from '../../../shared/__tests__/soundModuleUrls.mjs';
import { audioRecorder } from '../../../shared/__tests__/audioRecorder.mjs';
import { createHarness, harnessHooksUrl } from '../../../shared/__tests__/hookHarness.mjs';

test('the real Client Area hook captures the trigger, opens/closes immediately and synthesizes exactly one cue per action', async () => {
  const previous = { window: globalThis.window, AudioContext: globalThis.AudioContext };
  const { AudioContext, record } = audioRecorder();
  globalThis.window = { localStorage: { getItem: () => null }, requestIdleCallback() {} };
  globalThis.AudioContext = AudioContext;
  try {
    const motion = motionModuleUrls(moduleUrl, source, moduleUrl(source('../utils/frameTime.ts')));
    const urls = soundModuleUrls(moduleUrl, source, { tokens: motion.tokens, suffix: 'client-area-hook' });
    const { soundEngine } = await import(urls.engine), { CUE_NOTES } = await import(urls.key);
    const hooks = harnessHooksUrl(moduleUrl);
    const { useClientArea } = await import(moduleUrl(source('../../features/partner/useClientArea.ts')
      .replace("from 'react'", `from '${hooks}'`)
      .replace("from '@/shared/utils/soundEngine'", `from '${urls.engine}'`)
      .replace("from '@/shared/audio/transitionSound'", `from '${urls.transition}'`)));
    soundEngine.unlock();
    const harness = createHarness(useClientArea);
    const focus = [], first = { focus: options => focus.push(['first', options]) }, second = { focus: options => focus.push(['second', options]) };
    harness.mount();
    assert.equal(harness.output.clientArea, 'closed');
    harness.act(() => harness.output.closeClientArea());
    assert.deepEqual(record.pitches, []);
    harness.act(() => { harness.output.openClientArea(first); harness.output.openClientArea(second); });
    assert.equal(harness.output.clientArea, 'open');
    assert.equal(harness.output.clientOpenerRef.current === first, true);
    assert.deepEqual(focus, [['first', { preventScroll: true }]]);
    assert.deepEqual(record.pitches, CUE_NOTES.warpArrival.tones.map(p => p.hz));
    harness.act(() => { harness.output.closeClientArea(); harness.output.closeClientArea(); });
    assert.equal(harness.output.clientArea, 'closed');
    const cycle = [...CUE_NOTES.warpArrival.tones, ...CUE_NOTES.panelClose.tones].map(p => p.hz);
    assert.deepEqual(record.pitches, cycle);
    record.pitches.length = 0;
    for (let i = 0; i < 10; i++) {
      harness.act(() => harness.output.openClientArea(second));
      harness.act(() => harness.output.closeClientArea());
    }
    assert.equal(harness.output.clientOpenerRef.current === second, true);
    assert.deepEqual(record.pitches, Array.from({ length: 10 }, () => cycle).flat());
    assert.equal(record.sources.length, 0, 'no noise or additional audio sources on this path');
    harness.unmount();
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});

test('App keeps the scroll/suspension guards and the drawer trigger mounted beneath the modal', () => {
  const app = source('../../app/App.tsx');
  assert.match(app, /scrollLocked=\{[^}]*clientArea !== 'closed'/);
  assert.match(app, /isSceneCovered\(playingGame !== null, clientArea !== 'closed'/);
  assert.match(app, /useClientArea\(\)/);
  assert.match(app, /returnFocusRef=\{clientOpenerRef\}/);
  const drawer = app.slice(app.indexOf('function MobileDrawer('), app.indexOf('// ─── Game iframe overlay'));
  const clientButton = drawer.match(/<button\b[^>]*onClick=\{event => onClientArea\(event.currentTarget\)\}[^>]*>[\s\S]*?Client Area/);
  assert.ok(clientButton, 'the original drawer trigger stays mounted and captures pointer clicks');
  assert.doesNotMatch(clientButton[0], /onClose\(/);
});
