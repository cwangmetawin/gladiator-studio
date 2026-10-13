const REFERENCE_FPS = 60;
const MAX_DELTA_SECONDS = 0.1;

/** Babylon supplies milliseconds; cap pauses before advancing scene time. */
export function frameDeltaSeconds(deltaMilliseconds: number): number {
  return Math.max(0, Math.min(deltaMilliseconds / 1000, MAX_DELTA_SECONDS));
}

export function perSecond(perFrame: number): number {
  return perFrame * REFERENCE_FPS;
}

export function secondsFromFrames(frames: number): number {
  return frames / REFERENCE_FPS;
}

/** Preserve a legacy lerp factor exactly when dt is 1/60 second. */
export function approachRate(perFrameFactor: number): number {
  return -REFERENCE_FPS * Math.log1p(-perFrameFactor);
}

export function approach(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}

export function tweenProgress(elapsedSeconds: number, durationSeconds: number): number {
  return Math.max(0, Math.min(1, elapsedSeconds / durationSeconds));
}
