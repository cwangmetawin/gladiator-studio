import { perSecond, secondsFromFrames } from '@/shared/utils/frameTime';

export interface StarTwinkleData {
  readonly baseAlpha: Float32Array;
  readonly twPhase: Float32Array;
  readonly twSpeed: Float32Array;
  readonly colors: Float32Array;
}

const TWINKLE_SPEED = perSecond(0.05);
const UPDATE_INTERVAL = secondsFromFrames(2);

/** Update the scene-owned colour array at most 30 times per second. */
export function createStarTwinkle(data: StarTwinkleData, upload: (colors: Float32Array) => void) {
  let elapsed = 0;
  let nextUpdate = UPDATE_INTERVAL;

  return (dt: number): void => {
    elapsed += dt;
    if (elapsed + 1e-9 < nextUpdate) return;
    nextUpdate = (Math.floor((elapsed + 1e-9) / UPDATE_INTERVAL) + 1) * UPDATE_INTERVAL;
    const { baseAlpha, twPhase, twSpeed, colors } = data;
    for (let i = 0; i < baseAlpha.length; i++) {
      const tw = 0.5 + 0.5 * Math.sin(twPhase[i]! + elapsed * TWINKLE_SPEED * twSpeed[i]!);
      colors[i * 4 + 3] = baseAlpha[i]! * (0.35 + 0.65 * tw);
    }
    upload(colors);
  };
}
