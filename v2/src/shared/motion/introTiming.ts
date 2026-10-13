import type { SceneMilestone } from '@/features/starfield/sceneReadiness';

export const INTRO_MIN_MS = 1200;
export const INTRO_SAFETY_MS = 8000;
export const INTRO_FLASH_MS = 180;
export const INTRO_EXIT_MS = 500;
export const INTRO_REDUCED_FADE_MS = 120;

export interface IntroTiming {
  readonly startedAt: number;
  readonly reduced: boolean;
  readonly exitAt: number | null;
  readonly complete: boolean;
}

export function initialIntro(now: number, reduced: boolean): IntroTiming {
  return { startedAt: now, reduced, exitAt: null, complete: false };
}

export function introExitDuration(state: IntroTiming): number {
  return state.reduced ? INTRO_REDUCED_FADE_MS : INTRO_EXIT_MS;
}

function canExit(state: IntroTiming, ready: SceneMilestone | null): boolean {
  return ready === 'frame' || (state.reduced && ready === 'scene');
}

/** Readiness releases the hold; it never skips the brand moment or the fade. */
export function advanceIntro(state: IntroTiming, now: number, ready: SceneMilestone | null): IntroTiming {
  if (state.complete) return state;
  if (state.exitAt !== null) {
    return now >= state.exitAt + introExitDuration(state) ? { ...state, complete: true } : state;
  }
  const elapsed = Math.max(0, now - state.startedAt);
  if (elapsed >= INTRO_SAFETY_MS || (canExit(state, ready) && (state.reduced || elapsed >= INTRO_MIN_MS))) {
    return { ...state, exitAt: now };
  }
  return state;
}

/** Timers work even without a 2D canvas or an active requestAnimationFrame. */
export function nextIntroDeadline(state: IntroTiming, ready: SceneMilestone | null): number | null {
  if (state.complete) return null;
  if (state.exitAt !== null) return state.exitAt + introExitDuration(state);
  return state.startedAt + (canExit(state, ready) ? (state.reduced ? 0 : INTRO_MIN_MS) : INTRO_SAFETY_MS);
}
