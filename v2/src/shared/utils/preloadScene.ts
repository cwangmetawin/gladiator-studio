import { sceneReadiness } from '@/features/starfield/sceneReadiness';

// Warm the HTTP cache with the homepage scene's first-visible textures while the
// visitor is still on the age gate, so the cosmos is ready the moment the first screen
// appears instead of developing in seconds later. Babylon requests the same
// same-origin URLs afterwards and is served from cache. The 3D emblem's files
// (arenaAssets.preloadArena) and the first screen's own chunk are warmed the same way.

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
    img.src = src;
  }
}

export function preloadScene(): void {
  preloadSceneTextures();
  void loadSceneModule().catch(() => {});
  void import('@/features/starfield/StarfieldBackground').catch(() => {});
  void import('@/features/arena/arenaAssets').then(module => { module.preloadArena(); }).catch(() => {});
  void import('@/features/arena/home').catch(() => {});
}

/** A frame plus a task lets the age gate paint before speculative downloads. */
export function scheduleScenePreload(): void {
  requestAnimationFrame(() => { window.setTimeout(preloadScene, 0); });
}
