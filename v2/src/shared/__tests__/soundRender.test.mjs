import test from 'node:test';
import assert from 'node:assert/strict';
import { audioRecorder } from './audioRecorder.mjs';

test('the offline boundary renders the connected graph, real oscillator type and scheduled gain envelopes', () => {
  const { AudioContext } = audioRecorder(48000);
  const ac = new AudioContext(), osc = ac.createOscillator(), gain = ac.createGain();
  osc.frequency.setValueAtTime(1000, 0);
  gain.gain.setValueAtTime(0, 0);
  gain.gain.linearRampToValueAtTime(0.5, 0.01);
  gain.gain.exponentialRampToValueAtTime(0.005, 0.03);
  osc.connect(gain); gain.connect(ac.destination); osc.start(0); osc.stop(0.04);
  const data = ac.render(0.06)[0];
  const index = 252; // 1000 Hz at this sample is exactly at its sine maximum.
  assert.ok(Math.abs(data[index] - index / 48000 / 0.01 * 0.5) < 1e-6);
  const tail = 972;
  assert.ok(Math.abs(data[tail] - 0.5 * (0.005 / 0.5) ** ((tail / 48000 - 0.01) / 0.02)) < 1e-6);
  assert.ok(data.slice(1920).every(value => value === 0), 'stop time is audible, not just recorded');
  osc.type = 'square';
  const square = ac.render(0.06)[0];
  assert.ok(Math.abs(square[241] - data[241]) > 0.1);
  const detached = ac.createOscillator(); detached.start(0); detached.stop(0.04);
  assert.deepEqual(ac.render(0.06)[0], square, 'disconnected nodes cannot reach the output');
});

test('non-sine oscillators are band limited rather than aliasing harmonics back into the output', () => {
  const { AudioContext } = audioRecorder(), ac = new AudioContext(), osc = ac.createOscillator();
  osc.type = 'square'; osc.frequency.setValueAtTime(20000, 0);
  osc.connect(ac.destination); osc.start(); osc.stop(0.01);
  const data = ac.render(0.01)[0];
  // Only the fundamental is below 24 kHz; amplitude normalization does not affect this ratio.
  const expected = Math.sin(2 * Math.PI * 20000 / 48000) / Math.sin(4 * Math.PI * 20000 / 48000);
  assert.ok(Math.abs(data[1] / data[2] - expected) < 1e-6);
});

test('buffer source offsets, stereo, playback rate, looping and stop follow the played buffer', () => {
  const { AudioContext } = audioRecorder(8);
  const ac = new AudioContext(), buffer = ac.createBuffer(2, 4, 4), src = ac.createBufferSource();
  buffer.getChannelData(0).set([0, 1, 0, -1]); buffer.getChannelData(1).set([1, 0, -1, 0]);
  src.buffer = buffer; src.loop = true; src.connect(ac.destination); src.start(0.25, 0.5); src.stop(1);
  const data = ac.render(1.25);
  assert.equal(data[0][0], 0); assert.equal(data[1][2], -1);
  assert.equal(data[0][4], -1); assert.equal(data[0][6], 0);
  assert.ok(data.every(channel => channel.slice(8).every(value => value === 0)));
});
