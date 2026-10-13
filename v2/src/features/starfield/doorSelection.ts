import type { Constellation } from './constellationStore';

export const DESKTOP_DOOR_CAP = 6;
export const PHONE_DOOR_CAP = 3;
export const DOOR_WIDTH = 160;
export const PHONE_DOOR_WIDTH = 128;
export const DOOR_HEIGHT = 44;
export const DOOR_CLEARANCE = 8;
export const DOOR_TOP = 80;
export const DOOR_BOTTOM = 112;
export const PHONE_DOOR_BOTTOM = 48;

export interface ScreenRect { left: number; top: number; right: number; bottom: number; }
export interface DoorCandidate {
  readonly constellation: Constellation;
  readonly rect: ScreenRect;
  visible: boolean;
  gameTitle: string;
}

export function overlaps(a: ScreenRect, b: ScreenRect, clearance = DOOR_CLEARANCE): boolean {
  return a.left < b.right + clearance && a.right > b.left - clearance
    && a.top < b.bottom + clearance && a.bottom > b.top - clearance;
}

export function placeDoor(rect: ScreenRect, x: number, y: number, width: number, height: number, phone: boolean): boolean {
  const doorWidth = phone ? PHONE_DOOR_WIDTH : DOOR_WIDTH;
  rect.left = Math.round(x - doorWidth / 2);
  rect.right = rect.left + doorWidth;
  rect.top = Math.round(y - DOOR_HEIGHT / 2);
  rect.bottom = rect.top + DOOR_HEIGHT;
  // Reserve shell bars / ticker / safe areas; never clamp a door off its star.
  return rect.left >= DOOR_CLEARANCE && rect.right <= width - DOOR_CLEARANCE
    && rect.top >= DOOR_TOP && rect.bottom <= height - (phone ? PHONE_DOOR_BOTTOM : DOOR_BOTTOM);
}

/** Brightest eligible doors first, skipping collisions; the caller owns the output pool. */
export function selectDoors(candidates: readonly DoorCandidate[], obstacles: readonly ScreenRect[], phone: boolean, out: DoorCandidate[]): void {
  out.length = 0;
  const cap = phone ? PHONE_DOOR_CAP : DESKTOP_DOOR_CAP;
  for (let slot = 0; slot < cap; slot++) {
    let best: DoorCandidate | undefined;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]!;
      if (!candidate.visible || !candidate.gameTitle || candidate.constellation.count === 0 || out.includes(candidate)) continue;
      if (best && candidate.constellation.brightness <= best.constellation.brightness) continue;
      let blocked = false;
      for (let j = 0; j < obstacles.length; j++) {
        if (overlaps(candidate.rect, obstacles[j]!)) { blocked = true; break; }
      }
      for (let j = 0; !blocked && j < out.length; j++) {
        if (overlaps(candidate.rect, out[j]!.rect)) blocked = true;
      }
      if (!blocked) best = candidate;
    }
    if (!best) break;
    out.push(best);
  }
}
