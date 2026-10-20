import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from './sourceModule.mjs';
import { soundModuleUrls } from './soundModuleUrls.mjs';
import { motionModuleUrls } from './motionModuleUrls.mjs';
import { audioRecorder } from './audioRecorder.mjs';
import { createHarness, harnessHooksUrl } from './hookHarness.mjs';

test('the shipped About and Team in-copy links switch the arena page with exactly one click cue', async () => {
  const previous = { window: globalThis.window, AudioContext: globalThis.AudioContext };
  const { AudioContext, record } = audioRecorder();
  globalThis.window = { localStorage: { getItem: () => null }, requestIdleCallback() {} };
  globalThis.AudioContext = AudioContext;
  try {
    const motion = motionModuleUrls(moduleUrl, source, moduleUrl(source('../utils/frameTime.ts')));
    const urls = soundModuleUrls(moduleUrl, source, { tokens: motion.tokens, suffix: 'real-arena-cta' });
    const pageTransitionUrl = moduleUrl(source('../../features/arena-page/pageTransitionStore.ts'));
    const { soundEngine } = await import(urls.engine), { CUE_NOTES } = await import(urls.key);
    const { useArenaPage } = await import(moduleUrl(source('../../features/arena-page/useArenaPage.ts')
      .replace("from 'react'", `from '${harnessHooksUrl(moduleUrl)}'`)
      .replace("from '@/shared/utils/soundEngine'", `from '${urls.engine}'`)
      .replace("from './pageTransitionStore'", `from '${pageTransitionUrl}'`)
      .replace("from '@/shared/audio/transitionSound'", `from '${urls.transition}'`)));
    soundEngine.unlock();
    const h = createHarness(useArenaPage); h.mount();
    h.act(() => h.output.openPage('about', { focus() {} }));
    globalThis.window.dispatchEvent = event => h.act(() => h.output.openPage(event.detail));
    // The extracted button runs alone, so declare the component locals its label reads.
    for (const [path, handler, target, locals = ''] of [
      ['../../features/about/AboutSection.tsx', 'openContact', 'contact'],
      ['../../features/team/TeamSection.tsx', 'openCareers', 'careers', 'const jobs = [];'],
    ]) {
      record.pitches.length = 0;
      const original = source(path);
      const fn = original.match(new RegExp(`function ${handler}\\(\\) \\{[\\s\\S]*?\\n\\}`))[0];
      const markup = original.match(new RegExp(`<button\\b[^>]*onClick=\\{${handler}\\}[^>]*>[\\s\\S]*?</button>`))[0];
      const { control } = await import(moduleUrl(`${fn}\n${locals}\nexport const control = (${markup});`));
      control.props.onClick();
      assert.equal(h.output.page, target);
      assert.deepEqual(record.pitches, CUE_NOTES.click.tones.map(pitch => pitch.hz), `${path}: a switch never adds another open cue`);
    }
    h.unmount();
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
