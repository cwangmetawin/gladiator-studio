import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSignal, tonalVerdict, unpitchedVerdict } from '../../../scripts/sound-measure/analysis.mjs';

const rate = 48000;
const signal = (fn, seconds = 0.4, sampleRate = rate) => Float32Array.from(
  { length: Math.round(seconds * sampleRate) }, (_, i) => fn(i / sampleRate, i));
const sine = (hz, seconds, sampleRate) => signal(t => Math.sin(2 * Math.PI * hz * t), seconds, sampleRate);
const hz = midi => 440 * 2 ** ((midi - 69) / 12);
function random(seed = 7) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
}

test('FFT partial measurement accepts exact-key sines at both device sample rates, including a short tick', () => {
  for (const sampleRate of [44100, 48000]) for (const [midi, seconds] of [[26, 2], [74, 0.035], [93, 0.06]]) {
    const result = analyzeSignal(sine(hz(midi), seconds, sampleRate), sampleRate);
    assert.equal(tonalVerdict(result).pass, true, JSON.stringify(result));
    assert.ok(result.worstCents <= 5, `${midi}: ${result.worstCents} cents`);
    assert.ok(result.tonalCoherence > 0.9);
    assert.equal(unpitchedVerdict(result).pass, false, 'a pure sine cannot be called percussion');
  }
});

test('15 cents sharp, an out-of-key note and the real fifth harmonic of a G5 square all fail', () => {
  const sharp = analyzeSignal(sine(hz(74) * 2 ** (15 / 1200)), rate);
  assert.equal(tonalVerdict(sharp).pass, false);
  assert.ok(sharp.worstCents > 14 && sharp.worstCents < 16);
  assert.equal(tonalVerdict(analyzeSignal(sine(hz(80)), rate)).pass, false);
  const square = analyzeSignal(signal(t => Math.sign(Math.sin(2 * Math.PI * hz(79) * t))), rate);
  assert.equal(tonalVerdict(square).pass, false);
  assert.ok(square.partials.some(partial => Math.abs(partial.hz / hz(79) - 5) < 0.01), 'measure the fifth, not just the fundamental');
  assert.ok(square.outOfKeyEnergy > 0.01);
});

test('partials above 20 kHz remain inside the measurement up to the device Nyquist limit', () => {
  const inKey = analyzeSignal(sine(hz(137), 0.2), rate);
  assert.equal(tonalVerdict(inKey).pass, true);
  assert.ok(inKey.partials.some(partial => partial.hz > 20000));
  const offKey = analyzeSignal(sine(hz(138), 0.2), rate);
  assert.equal(tonalVerdict(offKey).pass, false);
  assert.ok(offKey.partials.some(partial => partial.hz > 23000));
});

test('a scale fundamental cannot hide a strong off-key partial 35 dB down', () => {
  const result = analyzeSignal(signal(t => Math.sin(2 * Math.PI * hz(74) * t)
    + 10 ** (-35 / 20) * Math.sin(2 * Math.PI * hz(80) * t)), rate);
  assert.equal(tonalVerdict(result).pass, false);
  assert.ok(result.partials.some(partial => Math.abs(partial.hz - hz(80)) < 0.5));
});

test('short decaying notes in a longer sequence are measured as partials, including the low ignition body', () => {
  const notes = [[86, 0, 0.06], [89, 0.08, 0.06], [91, 0.16, 0.06]];
  const result = analyzeSignal(signal(t => notes.reduce((sum, [midi, at, duration]) => {
    const age = t - at;
    if (age < 0 || age >= duration) return sum;
    const envelope = Math.min(1, age / 0.003, (duration - age) / 0.006) * Math.exp(-4 * age / duration);
    return sum + Math.sin(2 * Math.PI * hz(midi) * age) * envelope;
  }, 0), 0.3), rate);
  assert.equal(tonalVerdict(result).pass, true, JSON.stringify(result));
  assert.equal(result.partials.length, 3);
});

test('white noise measures unpitched, while silence and invalid samples never earn a pass', () => {
  const next = random();
  const noise = analyzeSignal(signal(() => next() * 2 - 1), rate);
  assert.equal(unpitchedVerdict(noise).pass, true);
  assert.ok(noise.flatness >= 0.06 && noise.tonalCoherence < 0.3, JSON.stringify(noise));
  assert.equal(tonalVerdict(noise).pass, false);
  const silence = analyzeSignal(new Float32Array(2048), rate);
  assert.equal(tonalVerdict(silence).pass, false);
  assert.equal(unpitchedVerdict(silence).pass, false);
  assert.throws(() => analyzeSignal([0, NaN, 0], rate), /finite/i);
  assert.throws(() => analyzeSignal([0, 1, 0], 0), /rate/i);
});

test('amplitude and padding cannot change the key verdict; pitch glides do not pass as stepped notes', () => {
  const samples = sine(hz(74));
  const padded = new Float32Array(samples.length + rate);
  padded.set(samples.map(value => value * 0.01), rate / 2);
  assert.equal(tonalVerdict(analyzeSignal(padded, rate)).pass, true);
  const glide = signal(t => Math.sin(2 * Math.PI * (hz(74) * t + (hz(77) - hz(74)) * t * t / 0.8)));
  assert.equal(tonalVerdict(analyzeSignal(glide, rate)).pass, false);
});
