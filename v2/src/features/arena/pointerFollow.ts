import { approach } from '@/shared/utils/frameTime';

// The emblem turns towards the pointer: up to +-8 degrees of yaw and +-5 of pitch (Phase 4 M1).
// With no mouse (a phone, a touch screen, or a mouse idle for 4 s) it sways slowly by itself, so the
// picture is never dead. All of this is plain maths: the scene only applies the results.

export const POINTER_YAW_DEG = 8;
export const POINTER_PITCH_DEG = 5;
export const AUTO_SWAY_AFTER_MS = 4000;
/** Approach rates, in 1/s: the emblem follows a real pointer briskly and an automatic sway lazily. */
export const POINTER_RATE = 5;
export const AUTO_RATE = 1.5;
/** The pose the static (reduced motion) frame and the first frame use: slightly turned, so the steel catches the key light. */
export const REST_POSE: PointerPose = Object.freeze({ x: -0.35, y: -0.35 });

export interface PointerPose { readonly x: number; readonly y: number }

const clamp = (value: number, low: number, high: number): number => Math.min(high, Math.max(low, value));

/** A pointer position in viewport pixels as a pose in [-1, 1] on both axes (x right, y down). */
export function pointerPose(clientX: number, clientY: number, width: number, height: number): PointerPose {
  if (!(width > 0) || !(height > 0)) return REST_POSE;
  return { x: clamp((clientX / width) * 2 - 1, -1, 1), y: clamp((clientY / height) * 2 - 1, -1, 1) };
}

/** The idle sway: a slow Lissajous around the rest pose, for the time t in seconds. */
export function swayPose(t: number): PointerPose {
  return { x: Math.sin(t * 0.45) * 0.45, y: -0.3 + Math.sin(t * 0.31) * 0.2 };
}

/** Pointer or sway? A phone never has a pointer; a mouse that stopped for AUTO_SWAY_AFTER_MS hands over to the sway. */
export function shouldSway(touchOnly: boolean, now: number, lastMoveAt: number): boolean {
  return touchOnly || now - lastMoveAt > AUTO_SWAY_AFTER_MS;
}

export function followPose(current: PointerPose, target: PointerPose, sway: boolean, dt: number): PointerPose {
  const rate = sway ? AUTO_RATE : POINTER_RATE;
  return { x: approach(current.x, target.x, rate, dt), y: approach(current.y, target.y, rate, dt) };
}

/** Euler angles in radians for the emblem's pivot. `presence` (0..1) fades the turn out while the helmet is being flown at. */
export function emblemRotation(pose: PointerPose, presence = 1): { readonly yaw: number; readonly pitch: number } {
  const degrees = Math.PI / 180;
  return { yaw: -pose.x * POINTER_YAW_DEG * degrees * presence, pitch: -pose.y * POINTER_PITCH_DEG * degrees * presence };
}
