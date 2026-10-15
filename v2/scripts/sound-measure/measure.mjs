import { analyzeSignal, tonalVerdict, unpitchedVerdict, LIMITS } from './analysis.mjs';

export { LIMITS };

/** Analyse channels separately: a mono downmix must never cancel an off-key stereo partial. */
export function measureCue(name, channels, sampleRate, tonal) {
  if (!channels.length || !channels[0].length || channels.some(channel => channel.length !== channels[0].length)) {
    throw new Error('Expected non-empty equally sized PCM channels');
  }
  const measured = channels.map(samples => {
    const result = analyzeSignal(samples, sampleRate);
    return { ...result, ...(tonal ? tonalVerdict(result) : unpitchedVerdict(result)) };
  });
  return {
    name, kind: tonal ? 'tonal' : 'unpitched', sampleRate, pass: measured.every(channel => channel.pass),
    duration: Math.max(...measured.map(channel => channel.duration)),
    worstCents: Math.max(...measured.map(channel => channel.worstCents)),
    outOfKeyEnergy: Math.max(...measured.map(channel => channel.outOfKeyEnergy)),
    flatness: Math.min(...measured.map(channel => channel.flatness)),
    tonalCoherence: Math.max(...measured.map(channel => channel.tonalCoherence)),
    peak: Math.max(...measured.map(channel => channel.peak)),
    rms: Math.max(...measured.map(channel => channel.rms)), channels: measured,
  };
}
