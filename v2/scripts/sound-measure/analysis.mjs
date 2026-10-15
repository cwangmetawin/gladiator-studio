import { fft } from './fft.mjs';

// Independent of key.ts: changing the synth must never change the measuring ruler.
const SCALE = new Set([0, 2, 4, 5, 7, 9, 10]);
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const LIMITS = Object.freeze({ cents: 10, targetCents: 5, partialDb: -40, flatness: 0.06, coherence: 0.3 });

function nearestScale(hz) {
  const midi = 69 + 12 * Math.log2(hz / 440);
  let best = null;
  for (let note = Math.floor(midi) - 2; note <= Math.ceil(midi) + 2; note++) {
    const pc = ((note % 12) + 12) % 12;
    if (!SCALE.has(pc)) continue;
    const cents = (midi - note) * 100;
    if (!best || Math.abs(cents) < Math.abs(best.cents)) best = { midi: note, note: `${NAMES[pc]}${Math.floor(note / 12) - 1}`, cents };
  }
  return best;
}

const median = values => { values.sort((a, b) => a - b); return values[Math.floor(values.length / 2)] ?? 0; };

/**
 * Hann window, 4x zero-padded FFT and log-parabolic peak interpolation. A partial owns its main
 * lobe: a short tick necessarily has a wide lobe, which is not a collection of detuned notes.
 * Local prominence separates coherent partials from noise; frequencies are never snapped to notes.
 */
export function analyzeSignal(samples, sampleRate) {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('Invalid sample rate');
  let peak = 0, squares = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample)) throw new Error('Samples must be finite');
    peak = Math.max(peak, Math.abs(sample)); squares += sample * sample;
  }
  const rms = Math.sqrt(squares / Math.max(1, samples.length));
  const empty = { audible: false, peak, rms, duration: 0, partials: [], worstCents: 0, outOfKeyEnergy: 0, flatness: 0, tonalCoherence: 0 };
  if (peak < 1e-9) return empty;
  let start = 0, end = samples.length;
  while (start < end && Math.abs(samples[start]) < peak * 1e-6) start++;
  while (end > start && Math.abs(samples[end - 1]) < peak * 1e-6) end--;
  const length = end - start;
  if (length < 16) return empty;
  const size = 2 ** Math.ceil(Math.log2(length * 4));
  const real = new Float64Array(size), imaginary = new Float64Array(size);
  for (let i = 0; i < length; i++) real[i] = samples[start + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (length - 1)));
  fft(real, imaginary);
  const power = new Float64Array(size / 2 + 1), binHz = sampleRate / size;
  const first = Math.max(1, Math.ceil(20 / binHz)), last = power.length - 2;
  let total = 0, logTotal = 0, strongest = 0;
  for (let i = first; i <= last; i++) {
    const p = real[i] ** 2 + imaginary[i] ** 2;
    power[i] = p; total += p; logTotal += Math.log(Math.max(p, 1e-30)); strongest = Math.max(strongest, p);
  }
  if (total <= 1e-20) return empty;
  const resolution = sampleRate / length, lobe = Math.ceil(2 * resolution / binHz);
  const candidates = [];
  for (let i = first + 1; i < last; i++) {
    if (power[i] < strongest * 10 ** (LIMITS.partialDb / 10) || power[i] <= power[i - 1] || power[i] <= power[i + 1]) continue;
    let left = i, right = i;
    while (left > first && power[left] > power[i] / 2) left--;
    while (right < last && power[right] > power[i] / 2) right++;
    // A note's decay may be much shorter than the whole cue. Measure its actual width.
    const width = Math.max(resolution / binHz, (right - left) / 2);
    const floor = [];
    for (let k = 3; k <= 10; k++) {
      const distance = Math.ceil(k * width);
      if (i - distance >= first) floor.push(power[i - distance]);
      if (i + distance <= last) floor.push(power[i + distance]);
    }
    if (power[i] < median(floor) * 12) continue;
    const a = Math.log(Math.max(power[i - 1], 1e-30)), b = Math.log(power[i]), c = Math.log(Math.max(power[i + 1], 1e-30));
    const shift = Math.max(-0.5, Math.min(0.5, 0.5 * (a - c) / (a - 2 * b + c)));
    candidates.push({ bin: i, hz: (i + shift) * binHz, height: power[i], width });
  }
  candidates.sort((a, b) => b.height - a.height);
  const chosen = [];
  for (const candidate of candidates) {
    // The first Hann side lobe is -31 dB at 2.36 native bins; it is part of that peak.
    if (!chosen.some(other => Math.abs(other.bin - candidate.bin) < 3 * Math.max(other.width, candidate.width))) chosen.push(candidate);
  }
  const owned = new Uint8Array(power.length);
  const partials = chosen.map(({ bin, hz, height, width }) => {
    let energy = 0;
    const radius = Math.max(lobe, Math.ceil(3 * width));
    for (let i = Math.max(first, bin - radius); i <= Math.min(last, bin + radius); i++) {
      if (!owned[i]) { energy += power[i]; owned[i] = 1; }
    }
    return { hz, ...nearestScale(hz), db: 10 * Math.log10(height / strongest), energy: energy / total };
  }).sort((a, b) => a.hz - b.hz);
  return {
    audible: true, peak, rms, duration: length / sampleRate, partials,
    worstCents: Math.max(0, ...partials.map(partial => Math.abs(partial.cents))),
    outOfKeyEnergy: partials.filter(partial => Math.abs(partial.cents) > LIMITS.cents).reduce((sum, partial) => sum + partial.energy, 0),
    flatness: Math.exp(logTotal / (last - first + 1)) / (total / (last - first + 1)),
    tonalCoherence: Math.min(1, partials.reduce((sum, partial) => sum + partial.energy, 0)),
  };
}

export function tonalVerdict(result) {
  const reasons = [];
  if (!result.audible || !result.partials.length) reasons.push('no audible tonal partials');
  if (result.tonalCoherence < LIMITS.coherence) reasons.push('insufficient tonal coherence');
  if (result.worstCents > LIMITS.cents) reasons.push(`partial exceeds ${LIMITS.cents} cents`);
  if (result.outOfKeyEnergy > 1e-4) reasons.push('out-of-key partial energy');
  return { pass: reasons.length === 0, reasons };
}

export function unpitchedVerdict(result) {
  const reasons = [];
  if (!result.audible) reasons.push('no audible signal');
  if (result.flatness < LIMITS.flatness && result.tonalCoherence >= LIMITS.coherence) reasons.push('signal rings tonally');
  return { pass: reasons.length === 0, reasons };
}
