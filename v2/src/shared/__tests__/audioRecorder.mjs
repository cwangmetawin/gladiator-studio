/** Observe real cue synthesis through a minimal Web Audio boundary. */
export function audioRecorder(sampleRate = 48000) {
  const record = { contexts: 0, pitches: [], oscillators: [], buffers: [], sources: [], resumes: 0 };
  const param = track => ({ value: 0,
    setValueAtTime(value) { this.value = value; track?.push(value); },
    exponentialRampToValueAtTime(value) { track?.push(value); },
    linearRampToValueAtTime() {},
  });
  const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {} });
  class AudioContext {
    constructor() { record.contexts++; this.sampleRate = sampleRate; this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    resume() { record.resumes++; this.state = 'running'; return Promise.resolve(); }
    createGain() { return { ...node(), gain: param() }; }
    createOscillator() {
      const pitches = [];
      const oscillator = { ...node(), frequency: param(pitches), detune: param(), pitches };
      record.oscillators.push(oscillator);
      // Keep all frequency writes, including glide endpoints, in one live array.
      oscillator.frequency = param(record.pitches);
      return oscillator;
    }
    createBuffer(channels, length, rate) {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      const buffer = { numberOfChannels: channels, length, sampleRate: rate, getChannelData: ch => data[ch] };
      record.buffers.push(buffer);
      return buffer;
    }
    createBufferSource() {
      const source = { ...node(), buffer: null, loop: false, started: false, start() { this.started = true; } };
      record.sources.push(source);
      return source;
    }
  }
  return { AudioContext, record };
}
