export const MAX_RENDER_DPR = 2;

export function cappedDevicePixelRatio(dpr: number): number {
  return Math.min(dpr, MAX_RENDER_DPR);
}

/** Babylon scales CSS dimensions by the inverse of this value. */
export function hardwareScalingLevel(dpr: number): number {
  return 1 / cappedDevicePixelRatio(dpr);
}
