export const CUE_NOISE_CHUNK_FRAMES = 8192;
const NOISE_SECONDS = 1;
type ScheduleChunk = (chunk: () => void) => void;

function scheduleChunk(chunk: () => void): void {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) window.requestIdleCallback(chunk, { timeout: 100 });
  else setTimeout(chunk, 0);
}

/** One reproducible broadband texture, prepared in idle slices, never by playCue. */
export function createCueBufferCache(schedule: ScheduleChunk = scheduleChunk) {
  let pending: Promise<AudioBuffer> | null = null;
  let buffer: AudioBuffer | null = null;
  return {
    get: (): AudioBuffer | null => buffer,
    prepare(ac: AudioContext): Promise<AudioBuffer> {
      if (pending) return pending;
      pending = new Promise<AudioBuffer>((resolve, reject) => {
        schedule(() => {
          try {
            const prepared = ac.createBuffer(1, Math.floor(ac.sampleRate * NOISE_SECONDS), ac.sampleRate);
            const data = prepared.getChannelData(0);
            let cursor = 0, seed = 0x4d34;
            const fill = (): void => {
              const end = Math.min(data.length, cursor + CUE_NOISE_CHUNK_FRAMES);
              for (; cursor < end; cursor++) {
                seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
                data[cursor] = seed / 2 ** 31 - 1;
              }
              if (cursor < data.length) schedule(fill);
              else { buffer = prepared; resolve(prepared); }
            };
            fill();
          } catch (error) { reject(error); }
        });
      });
      return pending;
    },
  };
}
