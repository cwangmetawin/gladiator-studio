import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from './sourceModule.mjs';
import { soundModuleUrls } from './soundModuleUrls.mjs';
import { motionModuleUrls } from './motionModuleUrls.mjs';
import { audioRecorder } from './audioRecorder.mjs';
import { createClock } from './hookHarness.mjs';

test('the shipped About and Team CTA props give the real Button exactly one reduced-motion arrival cue', async () => {
  const previous = { window: globalThis.window, AudioContext: globalThis.AudioContext, __navigate: globalThis.__navigate };
  const { AudioContext, record } = audioRecorder();
  globalThis.window = { localStorage: { getItem: () => null }, requestIdleCallback() {} };
  globalThis.AudioContext = AudioContext;
  try {
    const motion = motionModuleUrls(moduleUrl, source, moduleUrl(source('../utils/frameTime.ts')));
    const urls = soundModuleUrls(moduleUrl, source, { tokens: motion.tokens, suffix: 'real-cta' });
    const { soundEngine } = await import(urls.engine), { CUE_NOTES } = await import(urls.key);
    const { bindTransitionSounds } = await import(urls.transition), { createTransitionStore } = await import(motion.store);
    const clock = createClock();
    const store = createTransitionStore({ now: () => clock.now, schedule: clock.setTimeout, cancel: clock.clearTimeout });
    store.configure('reduced');
    const off = bindTransitionSounds(store, soundEngine);
    const buttonUrl = moduleUrl(source('../ui/Button.tsx').replace("from '@/shared/utils/soundEngine'", `from '${urls.engine}'`));
    const { Button } = await import(buttonUrl);
    soundEngine.unlock();
    for (const [path, handler, target] of [
      ['../../features/about/AboutSection.tsx', 'openContact', 'contact'],
      ['../../features/team/TeamSection.tsx', 'openCareers', 'careers'],
    ]) {
      store.request('none'); clock.advance(1000); record.pitches.length = 0;
      globalThis.__navigate = () => store.request(target);
      const markup = source(path).match(new RegExp(`<Button\\b[^>]*onClick=\\{${handler}\\}[^>]*>[\\s\\S]*?</Button>`))[0];
      const { control } = await import(moduleUrl(`import { Button } from '${buttonUrl}'; const ${handler} = globalThis.__navigate; export const control = (${markup});`));
      Button(control.props).props.onClick({});
      assert.deepEqual(record.pitches, CUE_NOTES.panelOpen.tones.map(pitch => pitch.hz), `${path}: no generic click alongside the arrival`);
    }
    off();
  } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
  }
});
