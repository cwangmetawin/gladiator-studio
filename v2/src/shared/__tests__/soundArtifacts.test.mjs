import test from 'node:test';
import assert from 'node:assert/strict';
import { encodeWav } from '../../../scripts/sound-measure/wav.mjs';
import { measureCue } from '../../../scripts/sound-measure/measure.mjs';
import { bundleSynth, loadNodeSynth } from '../../../scripts/sound-measure/synth.mjs';
import { renderNodeCue } from '../../../scripts/sound-measure/node.mjs';

test('PCM16 artifacts preserve stereo, clipping, signed samples, level and a valid RIFF length', () => {
  const bytes = encodeWav([Float32Array.from([-2, 0, 0.5]), Float32Array.from([2, -0.5, 0])], 48000);
  const view = new DataView(bytes.buffer), text = at => String.fromCharCode(...bytes.slice(at, at + 4));
  assert.equal(text(0), 'RIFF'); assert.equal(text(8), 'WAVE'); assert.equal(text(36), 'data');
  assert.equal(view.getUint32(4, true), bytes.length - 8); assert.equal(view.getUint32(40, true), 12);
  assert.equal(view.getUint16(22, true), 2); assert.equal(view.getUint32(24, true), 48000);
  assert.equal(view.getUint16(34, true), 16);
  assert.deepEqual(Array.from({ length: 6 }, (_, i) => view.getInt16(44 + i * 2, true)), [-32768, 32767, 0, -16384, 16384, 0]);
  assert.throws(() => encodeWav([[NaN]], 48000), /finite/);
});

test('separate stereo channels expose out-of-key energy that a downmix would cancel', () => {
  const rate = 48000, hz = midi => 440 * 2 ** ((midi - 69) / 12);
  const channel = sign => Float32Array.from({ length: rate / 2 }, (_, i) =>
    Math.sin(2 * Math.PI * hz(74) * i / rate) + sign * 0.2 * Math.sin(2 * Math.PI * hz(80) * i / rate));
  const left = channel(1), right = channel(-1);
  assert.equal(measureCue('stereo', [left, right], rate, true).pass, false);
  assert.equal(measureCue('mono', [left.map((value, i) => (value + right[i]) / 2)], rate, true).pass, true);
});

test('the controller bundle compiles without a browser, and its real-source mutations fail waveform analysis', async () => {
  assert.match(await bundleSynth({ format: 'iife' }), /var SoundHarness/);
  for (const [options, name] of [[{ mutateKey: true }, 'transmission'], [{ mutateSquare: true }, 'click']]) {
    const synth = await loadNodeSynth(options), { channels } = await renderNodeCue(synth, name);
    const result = measureCue(name, channels, 48000, true);
    assert.equal(result.pass, false, `${name}: bundle mutation must fail real PCM analysis`);
  }
});
