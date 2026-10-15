/** The shipped synth's Web Audio subset. Connections and automation produce actual PCM. */
function parameter(initial, writes) {
  let value = initial;
  const events = [];
  const add = (type, next, time) => { events.push({ type, value: next, time }); writes?.push(next); };
  return {
    get value() { return value; }, set value(next) { value = next; },
    setValueAtTime: (next, time) => add('set', next, time),
    linearRampToValueAtTime: (next, time) => add('linear', next, time),
    exponentialRampToValueAtTime: (next, time) => add('exponential', next, time),
    at(time) {
      let previous = { value, time: 0 };
      for (const event of events) {
        if (event.time > time) {
          if (event.type === 'set') break;
          const t = Math.max(0, (time - previous.time) / (event.time - previous.time));
          if (event.type === 'exponential') return previous.value * (event.value / previous.value) ** t;
          return previous.value + (event.value - previous.value) * t;
        }
        previous = event;
      }
      return previous.value;
    },
    events,
  };
}

function node() {
  return { outputs: [], connect(target) { this.outputs.push(target); return target; }, disconnect() { this.outputs = []; } };
}

function wave(phase, type, frequency, sampleRate) {
  if (type === 'sine') return Math.sin(phase);
  if (!['square', 'sawtooth', 'triangle'].includes(type)) throw new Error(`Unsupported oscillator type: ${type}`);
  // Fourier partials below Nyquist, rather than a sign/saw function that creates aliases.
  // Non-sine shapes are negative controls; Chromium supplies the native wavetable normalization.
  const harmonics = Math.max(1, Math.floor((sampleRate / 2 - 1) / Math.max(1, frequency)));
  let value = 0;
  for (let k = 1; k <= harmonics; k++) {
    if (type !== 'sawtooth' && k % 2 === 0) continue;
    const coefficient = type === 'square' ? 4 / (Math.PI * k)
      : type === 'sawtooth' ? 2 * (k % 2 ? 1 : -1) / (Math.PI * k)
      : 8 * ((k - 1) % 4 ? -1 : 1) / (Math.PI ** 2 * k ** 2);
    value += coefficient * Math.sin(k * phase);
  }
  return value;
}

export function audioRecorder(sampleRate = 48000) {
  const record = { contexts: 0, pitches: [], oscillators: [], buffers: [], sources: [], resumes: 0 };
  class AudioContext {
    constructor() {
      record.contexts++; this.sampleRate = sampleRate; this.currentTime = 0; this.state = 'running';
      this.destination = node(); this.generators = [];
    }
    resume() { record.resumes++; this.state = 'running'; return Promise.resolve(); }
    createGain() { return { ...node(), gain: parameter(1) }; }
    createOscillator() {
      const oscillator = { ...node(), type: 'sine', frequency: parameter(440, record.pitches), detune: parameter(0),
        at: Infinity, until: Infinity, start(at = 0) { this.at = at; }, stop(at = 0) { this.until = at; } };
      record.oscillators.push(oscillator); this.generators.push(oscillator);
      return oscillator;
    }
    createBuffer(channels, length, rate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      const buffer = { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: ch => data[ch] };
      record.buffers.push(buffer); return buffer;
    }
    createBufferSource() {
      const source = { ...node(), buffer: null, loop: false, loopStart: 0, loopEnd: 0, playbackRate: parameter(1),
        started: false, at: Infinity, until: Infinity, offset: 0,
        start(at = 0, offset = 0, duration = Infinity) { this.started = true; this.at = at; this.offset = offset; this.until = Math.min(this.until, at + duration); },
        stop(at = 0) { this.until = at; } };
      record.sources.push(source); this.generators.push(source); return source;
    }
    render(seconds) {
      const frames = Math.ceil(seconds * sampleRate), channels = [new Float32Array(frames), new Float32Array(frames)];
      const gainCache = new Map();
      const gainFor = target => {
        if (!gainCache.has(target)) gainCache.set(target, Float64Array.from({ length: frames }, (_, i) => target.gain.at(i / sampleRate)));
        return gainCache.get(target);
      };
      const paths = (from, seen = new Set()) => {
        if (from === this.destination) return [[]];
        if (seen.has(from)) throw new Error('Feedback is outside the synth subset');
        return from.outputs.flatMap(target => paths(target, new Set([...seen, from])).map(path => target.gain ? [gainFor(target), ...path] : path));
      };
      for (const generator of this.generators) {
        const routes = paths(generator);
        if (!routes.length) continue;
        let phase = 0, position = generator.offset * (generator.buffer?.sampleRate ?? 0);
        const start = Math.max(0, Math.ceil(generator.at * sampleRate)), end = Math.min(frames, Math.ceil(generator.until * sampleRate));
        for (let i = start; i < end; i++) {
          const time = i / sampleRate;
          let values;
          if (generator.frequency) {
            const frequency = generator.frequency.at(time + 0.5 / sampleRate) * 2 ** (generator.detune.at(time) / 1200);
            values = [wave(phase, generator.type, frequency, sampleRate)];
            phase += 2 * Math.PI * frequency / sampleRate;
          } else {
            const buffer = generator.buffer;
            if (!buffer) continue;
            const loopStart = generator.loopStart * buffer.sampleRate, loopEnd = (generator.loopEnd || buffer.duration) * buffer.sampleRate;
            if (generator.loop && position >= loopEnd) position = loopStart + (position - loopStart) % (loopEnd - loopStart);
            if (position >= buffer.length) break;
            const a = Math.floor(position), fraction = position - a;
            const b = a + 1 < buffer.length ? a + 1 : generator.loop ? Math.floor(loopStart) : a;
            values = Array.from({ length: buffer.numberOfChannels }, (_, ch) => {
              const data = buffer.getChannelData(ch); return data[a] + (data[b] - data[a]) * fraction;
            });
            position += buffer.sampleRate / sampleRate * generator.playbackRate.at(time);
          }
          for (const path of routes) {
            const gain = path.reduce((value, curve) => value * curve[i], 1);
            for (let ch = 0; ch < channels.length; ch++) channels[ch][i] += (values[ch] ?? values[0]) * gain;
          }
        }
      }
      return channels;
    }
  }
  return { AudioContext, record };
}
