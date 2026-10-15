import { sceneReadiness } from '@/features/starfield/sceneReadiness';

// Warm the HTTP cache with the homepage scene's first-visible textures while the
// visitor is still on the age gate, so the cosmos is ready the moment the first screen
// appears instead of developing in seconds later. Babylon requests the same
// same-origin URLs afterwards and is served from cache. The 3D emblem's files
// (arenaAssets.preloadArena) and the first screen's own chunk are warmed the same way,
// after the gate's first paint, in the browser's next idle slot.

const FIRST_VISIBLE = [
  '/nebula.webp',
  '/textures/earth_day.webp',
  '/textures/earth_night_2k.webp',
  '/textures/planet_moon.webp',
  '/textures/planet_jupiter.webp',
  '/textures/planet_saturn.webp',
] as const;

let started = false;
let modulePromise: Promise<typeof import('@/shared/babylon/babylonCore')> | null = null;

export function loadSceneModule(): Promise<typeof import('@/shared/babylon/babylonCore')> {
  if (!modulePromise) {
    modulePromise = import('@/shared/babylon/babylonCore').then(module => {
      sceneReadiness.mark('module');
      return module;
    }).catch((error: unknown) => {
      modulePromise = null; // A failed speculative fetch can retry on acceptance.
      throw error;
    });
  }
  return modulePromise;
}

export function preloadSceneTextures(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  for (const src of FIRST_VISIBLE) {
    const img = new Image();
    // Same request mode as Babylon's loader (Tools.CorsBehavior = 'anonymous') so the
    // browser can reuse this response for the texture fetch.
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.fetchPriority = 'low';
    img.src = src;
  }
}

/** The starfield's own files: its textures, Babylon and the scene's chunk. */
function preloadSceneBase(): void {
  preloadSceneTextures();
  void loadSceneModule().catch(() => {});
  void import('@/features/starfield/StarfieldBackground').catch(() => {});
}

let homeWarmed = false;

/** The first screen's own files, once: its chunk (the headline and the top bar), the 3D emblem's files and the arena chunk. */
export function preloadHome(): void {
  if (homeWarmed) return;
  homeWarmed = true;
  void import('@/features/arena/arenaAssets').then(module => { module.preloadArena(); }).catch(() => {});
  void import('@/features/arena/home').catch(() => {});
}

/** The visitor answered the gate: everything the first screen needs, now. */
export function preloadScene(): void {
  preloadSceneBase();
  preloadHome();
}

/**
 * An idle deadline, after a paint and a task. The old three-second wait missed visitors who answered quickly.
 * Same-origin textures and baked assets use low fetch priority; code stays in the existing lazy chunks. The
 * gate's initial paint runs first. Lighthouse/LCP still need a controller measurement on the final build.
 */
export const HOME_WARMUP_DELAY_MS = 250;
/**
 * Any of these says the visitor is there and about to answer: the first screen's files are warmed at once. Not focusin:
 * the gate focuses its own button when it opens, and that is not a visitor.
 */
const SIGNS = ['pointerdown', 'pointermove', 'keydown', 'touchstart'] as const;

/**
 * While the age gate is up. A frame plus a task lets it paint before speculative downloads; then the scene's own files
 * are warmed, and the first screen's files follow at idle (or immediately on a gesture). Returns the undo.
 */
export function scheduleScenePreload(): () => void {
  let cancelled = false;
  let timer: number | undefined;
  let idle: number | undefined;
  const stop = (): void => {
    for (const type of SIGNS) window.removeEventListener(type, warm, true);
    if (timer !== undefined) window.clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
  };
  function warm(): void { if (cancelled) return; stop(); preloadHome(); }
  requestAnimationFrame(() => {
    window.setTimeout(() => {
      if (cancelled) return;
      preloadSceneBase();
      for (const type of SIGNS) window.addEventListener(type, warm, { capture: true, passive: true });
      if (typeof window.requestIdleCallback === 'function') {
        idle = window.requestIdleCallback(warm, { timeout: HOME_WARMUP_DELAY_MS });
      } else timer = window.setTimeout(warm, HOME_WARMUP_DELAY_MS);
    }, 0);
  });
  return () => { cancelled = true; stop(); };
}
