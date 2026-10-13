import { CUE_NOTES, type EffectCue, type Pitch } from './key';

/** Oscillator envelopes stay here; pitches are owned exclusively by key.ts. */
export function playCue(ac: AudioContext, master: GainNode, cue: EffectCue): void {
  const tone = (pitch: Pitch, type: OscillatorType, duration: number, volume: number, delay = 0, end?: Pitch): void => {
    const at = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(pitch.hz, at);
    if (end) osc.frequency.exponentialRampToValueAtTime(end.hz, at + duration * 0.75);
    gain.gain.setValueAtTime(volume, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(at);
    osc.stop(at + duration);
  };
  const noise = (duration: number, volume: number): void => {
    const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * duration), ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * volume;
    const source = ac.createBufferSource();
    const gain = ac.createGain();
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(master);
    gain.gain.setValueAtTime(1, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
    source.start(ac.currentTime);
    source.stop(ac.currentTime + duration);
  };
  const sequence = (gap: number, duration: number, volume: number): void => {
    CUE_NOTES[cue].tones.forEach((pitch, i) => tone(pitch, 'sine', duration, volume, i * gap));
  };

  switch (cue) {
    case 'hover': tone(CUE_NOTES.hover.tones[0]!, 'sine', 0.06, 0.08); break;
    case 'click':
      tone(CUE_NOTES.click.tones[0]!, 'square', 0.08, 0.06);
      tone(CUE_NOTES.click.tones[1]!, 'sine', 0.06, 0.04);
      break;
    case 'panelOpen':
      CUE_NOTES.panelOpen.glides.forEach(([from, to], i) => tone(from, i === 0 ? 'sawtooth' : 'sine', i === 0 ? 0.25 : 0.2, i === 0 ? 0.06 : 0.12, 0, to));
      noise(0.05, 0.06);
      break;
    case 'panelClose': {
      const [from, to] = CUE_NOTES.panelClose.glides[0]!;
      tone(from, 'sawtooth', 0.2, 0.05, 0, to);
      break;
    }
    case 'transmission': sequence(0.08, 0.06, 0.04); break;
    case 'alert': sequence(0.05, 0.25, 0.05); break;
    case 'bigWin': sequence(0.1, 0.25, 0.06); break;
    case 'sectionSwitch': sequence(0.055, 0.08, 0.045); break;
    case 'warpStart': noise(0.32, 0.09); break;
    case 'warpArrival': sequence(0.07, 0.15, 0.05); break;
    case 'catalogueFocus': tone(CUE_NOTES.catalogueFocus.tones[0]!, 'sine', 0.035, 0.035); break;
  }
}
