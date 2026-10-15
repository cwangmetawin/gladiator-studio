import { HELMET_CROSSING_SCREENS } from './diveFlash';

// The DOM also knows about the drawer and player, beyond the scene's panel visibility.
let uncovered = false;
export const arenaSoundVisibility = Object.freeze({
  get: (): boolean => uncovered,
  set(value: boolean): void { uncovered = value; },
});

interface ArcState {
  readonly home: boolean; readonly covered: boolean; readonly reduced: boolean;
  readonly seconds: number; readonly ready: boolean; readonly visibility: number; readonly presence: number;
}

export function canFireArenaArc(state: ArcState): boolean {
  return state.home && !state.covered && !state.reduced && state.seconds >= 0 && state.ready
    && state.visibility > 0.5 && state.presence > 0.5;
}

interface CrossingFrame {
  readonly screens: number; readonly enabled: boolean; readonly reduced: boolean; readonly nowMs: number;
}

/** Forward only. A full 0.08-screen retreat rearms; an 800 ms budget rejects rapid reversals. */
export function createCrossingSound(initialScreens: number, play: (soft: boolean) => void, initialReduced = false) {
  let previous = initialScreens, reduced = initialReduced, armed = initialScreens < HELMET_CROSSING_SCREENS;
  let lastAt = -Infinity;
  return {
    update(frame: CrossingFrame): void {
      if (!Number.isFinite(frame.screens) || !Number.isFinite(frame.nowMs)) return;
      const threshold = frame.reduced ? 1 : HELMET_CROSSING_SCREENS;
      if (frame.reduced !== reduced) {
        reduced = frame.reduced; previous = frame.screens; armed = frame.screens < threshold;
        return;
      }
      if (frame.screens <= threshold - 0.08) armed = true;
      const crossed = previous < threshold && frame.screens >= threshold;
      previous = frame.screens;
      if (!crossed) return;
      const audible = armed && frame.enabled && frame.nowMs - lastAt >= 800;
      armed = false;
      if (audible) { lastAt = frame.nowMs; play(frame.reduced); }
    },
  };
}

/** The same centre identity covers scroll, drag, keys, ticks and the flat fallback. */
export function createHallSound(play: () => void) {
  let previous: string | null = null, wasEnabled = false;
  return {
    update(identity: string | null, enabled: boolean): void {
      const changed = identity !== null && previous !== null && identity !== previous;
      previous = identity;
      if (enabled && wasEnabled && changed) play();
      wasEnabled = enabled;
    },
  };
}
