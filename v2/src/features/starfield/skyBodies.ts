import { approach } from '@/shared/utils/frameTime';

/** The one thing a body needs to fade: Babylon's mesh visibility (0 is not drawn, 1 is opaque). */
export interface Fadeable {
  visibility: number;
}

/** A fade ends this close to its target and lands on it exactly, so a hidden body is not drawn at all. */
const LANDING = 0.01;

/**
 * Fades a group of bodies (a planet and its ring, the distant bodies, the sun glow) towards `target` (0 or 1).
 *
 * The first screen (Phase 4) is the emblem alone: no planet and no sun glow is in its picture. They belong to a panel's
 * camera flight: they fade in as it leaves home and out as it returns. A group shares one fade, held in its first
 * member's visibility. The bodies stay enabled (visibility 0 is not drawn), so the scene's readiness still waits for
 * their shaders and textures, and the first flight to a planet does not hitch on a shader compile.
 *
 * `instant` jumps straight to the target (reduced motion, and the very first frame).
 */
export function fadeBodies(bodies: readonly Fadeable[], target: number, rate: number, dt: number, instant: boolean): void {
  const first = bodies[0];
  if (!first) return;
  const stepped = approach(first.visibility, target, rate, dt);
  const visibility = instant || Math.abs(stepped - target) < LANDING ? target : stepped;
  for (const body of bodies) body.visibility = visibility;
}
