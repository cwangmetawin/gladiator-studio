// Screen distances, not time or wheel deltas, are the journey's source of truth.
export const DIVE_SCREENS = 0.9;
export const JOURNEY_SCREENS = 1.9;
const clamp = (value: number, limit = JOURNEY_SCREENS): number => Math.min(limit, Math.max(0, Number.isFinite(value) ? value : 0));

export function scrollScreens(scrollY: number, screenHeight: number, startY = 0, limit = JOURNEY_SCREENS): number {
  return screenHeight > 0 ? clamp((scrollY - startY) / screenHeight, limit) : 0;
}

/** With reduced motion there are exactly two poses; crossing the first screen is a cut. */
export function cameraScreens(screens: number, reduced: boolean): number {
  return reduced ? screens < 1 ? 0 : JOURNEY_SCREENS : clamp(screens);
}

export function smoothstep(start: number, end: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - start) / (end - start)));
  return t * t * (3 - 2 * t);
}

export function doorsVisible(screens: number, reduced: boolean): boolean {
  return reduced ? screens < 1 : screens < 0.18;
}

/** Only the rendered camera is damped. Native scroll, its store and the DOM never wait for this. */
export function smoothScreens(current: number, target: number, dt: number): number {
  if (dt <= 0) return target;
  const next = current + (target - current) * (1 - Math.exp(-5.5 * Math.min(dt, 0.1)));
  return Math.abs(next - target) < 0.0001 ? target : next;
}

export function createJourneyProgress() {
  let screens = 0;
  let limit = JOURNEY_SCREENS;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: (): number => screens,
    getLimit: (): number => limit,
    setLimit(value: number): void { limit = Math.max(JOURNEY_SCREENS, Number.isFinite(value) ? value : JOURNEY_SCREENS); },
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    publish(value: number): void {
      const next = clamp(value, limit);
      if (next === screens) return;
      screens = next;
      listeners.forEach(listener => listener());
    },
  };
}

export const journeyProgress = createJourneyProgress();
