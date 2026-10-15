/** Interleaved little-endian PCM16, preserving stereo and the synth's actual level. */
export function encodeWav(channels, sampleRate) {
  if (!channels.length || channels.some(channel => channel.length !== channels[0].length)) throw new Error('Invalid PCM channels');
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new Error('Invalid sample rate');
  const frames = channels[0].length, count = channels.length, bytes = frames * count * 2;
  const buffer = new ArrayBuffer(44 + bytes), view = new DataView(buffer);
  const text = (at, value) => { for (let i = 0; i < value.length; i++) view.setUint8(at + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + bytes, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, bytes, true);
  for (let i = 0; i < frames; i++) for (let ch = 0; ch < count; ch++) {
    const sample = channels[ch][i];
    if (!Number.isFinite(sample)) throw new Error('PCM samples must be finite');
    const clamped = Math.min(1, Math.max(-1, sample));
    view.setInt16(44 + (i * count + ch) * 2, Math.round(clamped * (clamped < 0 ? 32768 : 32767)), true);
  }
  return new Uint8Array(buffer);
}
