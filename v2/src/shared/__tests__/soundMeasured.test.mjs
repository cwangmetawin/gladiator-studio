import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from './sourceModule.mjs';
import { soundModuleUrls } from './soundModuleUrls.mjs';
import { audioRecorder } from './audioRecorder.mjs';
import { analyzeSignal, tonalVerdict, unpitchedVerdict } from '../../../scripts/sound-measure/analysis.mjs';

const urls = soundModuleUrls(moduleUrl, source, {
  mutateKey: process.env.MUTATE_SOUND_KEY === '1', mutateSquare: process.env.MUTATE_SOUND_SQUARE === '1',
});
const { CUE_NOTES } = await import(urls.key);
const { playCue } = await import(urls.player);
const { createAmbientBufferCache } = await import(urls.ambient);

test('all four arena cues exist in the real synthesizer table', () => {
  for (const name of ['ignite', 'arc', 'crossing', 'gameSwitch']) assert.ok(CUE_NOTES[name], name);
});

for (const [name, notes] of Object.entries(CUE_NOTES)) {
  test(`real rendered ${name} obeys the measured pitch/noise contract`, async () => {
    const { AudioContext, record } = audioRecorder();
    const ac = new AudioContext(), master = ac.createGain();
    master.gain.value = 0.35; master.connect(ac.destination);
    if (name === 'ambient') {
      const buffer = await createAmbientBufferCache(callback => callback()).prepare(ac);
      const src = ac.createBufferSource(); src.buffer = buffer; src.connect(master); src.start();
    } else {
      const noise = await (await import(urls.noise)).createCueBufferCache(callback => callback()).prepare(ac);
      playCue(ac, master, name, noise);
    }
    for (const [channel, samples] of ac.render(name === 'ambient' ? 8 : 1.2).entries()) {
      const result = analyzeSignal(samples, ac.sampleRate);
      const verdict = notes.tones.length ? tonalVerdict(result) : unpitchedVerdict(result);
      assert.equal(verdict.pass, true, `${name}/${channel}: ${verdict.reasons.join(', ')}; cents=${result.worstCents}, out=${result.outOfKeyEnergy}, flatness=${result.flatness}`);
      if (notes.tones.length) assert.ok(result.worstCents <= 5, `${name}/${channel}: keep the Node measurement inside the five-cent target`);
    }
    assert.ok(record.oscillators.every(osc => osc.type === 'sine'), `${name}: raw harmonics are forbidden`);
    assert.ok(record.oscillators.every(osc => osc.frequency.events.every(event => event.type === 'set')), `${name}: no frequency ramps`);
  });
}
