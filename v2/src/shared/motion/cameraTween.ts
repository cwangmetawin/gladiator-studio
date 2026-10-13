import { approach } from '@/shared/utils/frameTime';
import { cameraEase } from './tokens';

export interface CameraPose {
  readonly alpha: number;
  readonly beta: number;
  readonly radius: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly screenX: number;
}

export interface CameraTween {
  readonly from: CameraPose;
  readonly to: CameraPose;
  readonly startedAt: number;
  readonly durationMs: number;
}

export function nearestCameraAlpha(from: number, to: number): number {
  const turn = Math.PI * 2;
  const delta = ((to - from + Math.PI) % turn + turn) % turn - Math.PI;
  return from + delta;
}

export function createCameraTween(from: CameraPose, to: CameraPose, startedAt: number, durationMs: number): CameraTween {
  // Capture values, never share Babylon's mutable target vector with the tween.
  return { from: { ...from }, to: { ...to, alpha: nearestCameraAlpha(from.alpha, to.alpha) }, startedAt, durationMs };
}

export function sampleCameraTween(tween: CameraTween, now: number): CameraPose {
  const progress = tween.durationMs === 0 ? 1 : Math.max(0, Math.min(1, (now - tween.startedAt) / tween.durationMs));
  const t = cameraEase(progress);
  const mix = (from: number, to: number) => from + (to - from) * t;
  return {
    alpha: mix(tween.from.alpha, tween.to.alpha), beta: mix(tween.from.beta, tween.to.beta),
    radius: mix(tween.from.radius, tween.to.radius), x: mix(tween.from.x, tween.to.x),
    y: mix(tween.from.y, tween.to.y), z: mix(tween.from.z, tween.to.z),
    screenX: mix(tween.from.screenX, tween.to.screenX),
  };
}

export function approachCameraPose(from: CameraPose, to: CameraPose, rate: number, dt: number): CameraPose {
  return {
    alpha: approach(from.alpha, nearestCameraAlpha(from.alpha, to.alpha), rate, dt), beta: approach(from.beta, to.beta, rate, dt),
    radius: approach(from.radius, to.radius, rate, dt), x: approach(from.x, to.x, rate, dt),
    y: approach(from.y, to.y, rate, dt), z: approach(from.z, to.z, rate, dt),
    screenX: approach(from.screenX, to.screenX, rate, dt),
  };
}
