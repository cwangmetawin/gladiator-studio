import { CUE_NOTES, type EffectCue, type Pitch } from './key';

/** Additive partials and note steps only. The caller owns the prewarmed noise buffer. */
export function playCue(ac: AudioContext, master: GainNode, cue: EffectCue, noiseBuffer: AudioBuffer | null = null, level = 1): () => void {
  const sources: AudioScheduledSourceNode[] = [];
  const tone = (pitch: Pitch, duration: number, volume: number, delay = 0, attack = 0.003): void => {
    const at = ac.currentTime + delay;
    const osc = ac.createOscillator(), gain = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(pitch.hz, at);
    // A short attack and a zero-ended release avoid discontinuities masquerading as partials.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume * level, at + Math.min(attack, duration * 0.25));
    gain.gain.exponentialRampToValueAtTime(Math.min(0.001, volume * 0.02) * level, at + duration * 0.88);
    gain.gain.linearRampToValueAtTime(0, at + duration);
    osc.connect(gain); gain.connect(master); osc.start(at); osc.stop(at + duration);
    sources.push(osc);
  };
  const noise = (duration: number, volume: number, delay = 0, offset = 0): void => {
    if (!noiseBuffer) return;
    const at = ac.currentTime + delay, source = ac.createBufferSource(), gain = ac.createGain();
    source.buffer = noiseBuffer;
    gain.gain.setValueAtTime(volume * level, at);
    gain.gain.exponentialRampToValueAtTime(volume * level * 0.001, at + duration * 0.95);
    gain.gain.linearRampToValueAtTime(0, at + duration);
    source.connect(gain); gain.connect(master); source.start(at, offset); source.stop(at + duration);
    sources.push(source);
  };
  const sequence = (gap: number, duration: number, volume: number, attack = 0.003): void => {
    CUE_NOTES[cue].tones.forEach((pitch, i) => tone(pitch, duration, volume, i * gap, attack));
  };

  switch (cue) {
    case 'hover': tone(CUE_NOTES.hover.tones[0]!, 0.06, 0.08); break;
    case 'click':
      CUE_NOTES.click.tones.forEach((pitch, i) => tone(pitch, i === 0 ? 0.08 : 0.06, [0.072, 0.04, 0.018][i]!));
      break;
    case 'panelOpen':
      CUE_NOTES.panelOpen.tones.forEach((pitch, i) => tone(pitch, [0.1, 0.24, 0.12, 0.1][i]!, [0.035, 0.1, 0.03, 0.025][i]!, [0, 0, 0.06, 0.15][i]!));
      break;
    case 'panelClose':
      CUE_NOTES.panelClose.tones.forEach((pitch, i) => tone(pitch, [0.065, 0.075, 0.07, 0.08][i]!, [0.04, 0.035, 0.03, 0.035][i]!, [0, 0.04, 0.08, 0.12][i]!));
      break;
    case 'transmission': sequence(0.08, 0.06, 0.04, 0.009); break;
    case 'alert': sequence(0.05, 0.25, 0.05); break;
    case 'bigWin': sequence(0.1, 0.25, 0.06); break;
    case 'sectionSwitch': sequence(0.055, 0.08, 0.045); break;
    case 'warpArrival': sequence(0.07, 0.15, 0.05); break;
    case 'catalogueFocus': tone(CUE_NOTES.catalogueFocus.tones[0]!, 0.035, 0.035); break;
    case 'ignite':
      CUE_NOTES.ignite.tones.forEach((pitch, i) => tone(pitch, [0.4, 0.48, 0.48, 0.5, 0.48][i]!, [0.045, 0.028, 0.03, 0.025, 0.03][i]!, i * 0.08));
      break;
    case 'arc': noise(0.045, 0.022, 0, 0.17); noise(0.035, 0.016, 0.045, 0.39); noise(0.025, 0.012, 0.09, 0.61); break;
    case 'crossing': sequence(0.04, 0.22, 0.035); break;
    case 'gameSwitch': tone(CUE_NOTES.gameSwitch.tones[0]!, 0.045, 0.025); break;
  }
  return () => {
    for (const source of sources) {
      try { source.stop(ac.currentTime); } catch { /* An ended source has nothing left to cancel. */ }
      source.disconnect();
    }
  };
}
