import { CUE_NOTES } from './key';

export const AMBIENT_SECONDS = 8;
export const AMBIENT_CHUNK_FRAMES = 8192;
type ScheduleChunk = (chunk: () => void) => void;

function scheduleChunk(chunk: () => void): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    window.requestIdleCallback(chunk, { timeout: 100 });
  } else {
    setTimeout(chunk, 0);
  }
}

/** Allocate once after unlock, then fill bounded chunks away from the hand-off. */
export function createAmbientBufferCache(schedule: ScheduleChunk = scheduleChunk) {
  let cached: Promise<AudioBuffer> | null = null;
  return {
    prepare(ac: AudioContext): Promise<AudioBuffer> {
      if (cached) return cached;
      cached = new Promise<AudioBuffer>((resolve) => {
        schedule(() => {
          const length = Math.floor(ac.sampleRate * AMBIENT_SECONDS);
          const buffer = ac.createBuffer(2, length, ac.sampleRate);
          const left = buffer.getChannelData(0);
          const right = buffer.getChannelData(1);
          const [bass, fifth, shimmer] = CUE_NOTES.ambient.tones;
          let cursor = 0;
          const fill = (): void => {
            const end = Math.min(length, cursor + AMBIENT_CHUNK_FRAMES);
            for (; cursor < end; cursor++) {
              const t = cursor / ac.sampleRate;
              // Movement modulates amplitude, never the exact scale frequencies.
              const body = Math.sin(2 * Math.PI * bass!.hz * t) * 0.03
                + Math.sin(2 * Math.PI * fifth!.hz * t) * (0.018 + Math.sin(t * 0.3) * 0.002)
                + Math.sin(2 * Math.PI * shimmer!.hz * t) * Math.sin(t * 0.5) * 0.008;
              const seam = Math.min(1, cursor / (ac.sampleRate * 0.02), (length - 1 - cursor) / (ac.sampleRate * 0.02));
              left[cursor] = (body + (Math.random() * 2 - 1) * 0.004) * seam;
              right[cursor] = (body * (0.95 + Math.sin(t * 0.7) * 0.05) + (Math.random() * 2 - 1) * 0.004) * seam;
            }
            if (cursor < length) schedule(fill);
            else resolve(buffer);
          };
          fill();
        });
      });
      return cached;
    },
  };
}
