// npm run test:unit; MUTATE_SOUND_KEY=1 must fail the real transmission checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { moduleUrl, source } from './sourceModule.mjs';
import { soundModuleUrls } from './soundModuleUrls.mjs';
import { audioRecorder } from './audioRecorder.mjs';

const urls = soundModuleUrls(moduleUrl, source, { mutateKey: process.env.MUTATE_SOUND_KEY === '1' });
const { SOUND_KEY, NOTES, CUE_NOTES } = await import(urls.key);
const { playCue } = await import(urls.player);

function assertScalePitch(hz, label) {
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  const exact = 440 * 2 ** ((midi - 69) / 12);
  const cents = 1200 * Math.log2(hz / exact);
  assert.ok(Math.abs(cents) <= 1, `${label}: ${hz} Hz is ${cents.toFixed(3)} cents from A440 equal temperament`);
  assert.ok(SOUND_KEY.pitchClasses.includes(((midi % 12) + 12) % 12), `${label}: MIDI ${midi} is outside ${SOUND_KEY.name}`);
}

test('the cue table names D natural minor and every declared tonal frequency is in key within one cent', () => {
  assert.equal(SOUND_KEY.name, 'D natural minor');
  assert.equal(SOUND_KEY.referenceHz, 440);
  assert.deepEqual(SOUND_KEY.pitchClasses, [2, 4, 5, 7, 9, 10, 0]);
  for (const [name, pitch] of Object.entries(NOTES)) {
    assert.equal(pitch.name, name);
    assert.equal(pitch.hz, 440 * 2 ** ((pitch.midi - 69) / 12));
    assertScalePitch(pitch.hz, name);
  }
  for (const [name, cue] of Object.entries(CUE_NOTES)) {
    assert.equal(cue.key, SOUND_KEY.name, `${name} must name the global key`);
    for (const pitch of cue.tones) assertScalePitch(pitch.hz, `${name}/${pitch.name}`);
  }
});

test('no cue declares a pitch glide; panel motion is expressed as exact scale steps', () => {
  assert.ok(CUE_NOTES.panelOpen.tones.length > 1);
  assert.ok(CUE_NOTES.panelClose.tones.length > 1);
  for (const [name, cue] of Object.entries(CUE_NOTES)) {
    assert.deepEqual(cue.glides, [], `${name} may not sweep through out-of-key pitches`);
  }
});

test('the shipped synth actually writes only its declared pitches; Client Area open and close have no noise', async () => {
  assert.equal('warpStart' in CUE_NOTES, false, 'the retired noise burst has no remaining caller');
  for (const [name, cue] of Object.entries(CUE_NOTES)) {
    if (name === 'ambient') continue; // Its real sample synthesis is tested separately.
    const { AudioContext, record } = audioRecorder();
    const ac = new AudioContext();
    const { createCueBufferCache } = await import(urls.noise);
    const noise = await createCueBufferCache(callback => callback()).prepare(ac);
    playCue(ac, ac.createGain(), name, noise);
    const declared = [...cue.tones.map(pitch => pitch.hz), ...cue.glides.flatMap(pair => pair.map(pitch => pitch.hz))];
    assert.deepEqual(record.pitches, declared, `${name} oscillator frequencies must come from its cue table`);
    for (const hz of record.pitches) assertScalePitch(hz, `${name} synthesized`);
    assert.ok(record.oscillators.every(osc => osc.detune.value === 0));
    if (name === 'warpArrival' || name === 'panelClose') {
      assert.ok(record.oscillators.length > 0);
      assert.equal(record.sources.length, 0);
      assert.equal(cue.noise, false);
    }
  }
});
