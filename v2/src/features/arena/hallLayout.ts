export type RGB = readonly [number, number, number];
export const CARD_HEIGHT = 2.72;
export const CARD_ASPECT = 837 / 1122;

export function wrapSlot(distance: number, count: number): number {
  return count > 0 ? ((distance + count / 2) % count + count) % count - count / 2 : 0;
}

export function slotTransform(offset: number, phone: boolean) {
  const theta = offset * (phone ? 0.36 : 0.45), distance = Math.abs(offset), radius = phone ? 5 : 5.6;
  const focus = Math.max(0, 1 - distance), scale = 1 + 0.12 * focus * focus * (3 - 2 * focus);
  const edge = phone ? 2.25 : 3.35, start = phone ? 1.25 : 2.55;
  const t = Math.min(1, Math.max(0, (distance - start) / (edge - start)));
  return {
    x: radius * Math.sin(theta), y: CARD_HEIGHT * (scale - 1) / 2, z: radius * (1 - Math.cos(theta)),
    yaw: -theta * 0.62, scale, brightness: Math.exp(-distance * 0.92), blur: Math.min(2.8, distance * 1.25),
    alpha: 1 - t * t * (3 - 2 * t),
  };
}

/** Size/position the ring relative to M2's final camera; never introduce a second camera or change its track. */
export function frameRing(width: number, height: number, fov: number, phone: boolean) {
  const aspect = CARD_ASPECT, tangent = Math.tan(fov / 2), viewportAspect = Math.max(1, width) / Math.max(1, height);
  const heroHeight = CARD_HEIGHT * 1.12;
  const distance = Math.max(heroHeight / ((phone ? 0.52 : 0.58) * 2 * tangent),
    heroHeight * aspect / ((phone ? 0.815 : 0.52) * 2 * tangent * viewportAspect));
  return { distance, height: CARD_HEIGHT, aspect, screenY: phone ? 0.37 : 0.40 };
}

/** Snapshot-to-snapshot transition rather than per-frame lerp: it finishes in a bounded 600 ms. */
export function mixTheme(from: RGB, to: RGB, elapsedMs: number, reduced: boolean): RGB {
  const t = reduced ? 1 : Math.min(1, Math.max(0, elapsedMs / 600));
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
}
