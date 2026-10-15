import { JOURNEY_SCREENS } from './journeyProgress';

export const HALL_SLICE = 0.64;
export const SNAP_IDLE_MS = 200;
const finite = (value: number): number => Number.isFinite(value) ? value : 0;
export const clampHall = (offset: number, count: number): number => Math.max(0, Math.min(Math.max(0, count - 1), finite(offset)));

/** The dive stays 0.9 screens, the arrival stays one screen; only the hall extends the document. */
export function hallOffset(screens: number, count: number, reduced = false): number {
  const offset = clampHall((finite(screens) - JOURNEY_SCREENS) / HALL_SLICE, count);
  return reduced ? Math.round(offset) : offset;
}

export function hallScreens(index: number, count: number): number {
  return JOURNEY_SCREENS + clampHall(index, count) * HALL_SLICE;
}

export function hallTrackScreens(count: number): number {
  return 1 + JOURNEY_SCREENS + Math.max(0, count - 1) * HALL_SLICE;
}

export function snapHall(offset: number, idleMs: number, dragging: boolean, count: number): number | null {
  const nearest = Math.round(clampHall(offset, count));
  return !dragging && idleMs >= SNAP_IDLE_MS && Math.abs(offset - nearest) > 0.001 ? nearest : null;
}

export function followHall(current: number, target: number, dt: number, reduced: boolean): number {
  if (reduced || dt <= 0) return target;
  const next = current + (target - current) * (1 - Math.exp(-12 * Math.min(dt, 0.1)));
  return Math.abs(next - target) < 0.0001 ? target : next;
}
